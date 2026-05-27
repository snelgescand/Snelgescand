/**
 * Fastify server entrypoint.
 *
 * Start volgorde:
 *   1. Config validatie (faalt fast)
 *   2. Logger setup (pino-pretty in dev, JSON in prod)
 *   3. Auto-seed (alleen als DB nog leeg is)
 *   4. Plugins: helmet, cors, cookie+jwt+auth, rate-limit
 *   5. Routes registreren
 *   6. Health check
 *   7. Luister op PORT
 *   8. Graceful shutdown bij SIGTERM/SIGINT
 */

import Fastify, { type FastifyBaseLogger } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getConfig, isProduction } from './config.js';
import authPlugin, { hashWachtwoord } from './plugins/auth.js';
import authRoutes from './routes/auth.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import modulesRoutes from './routes/modules.routes.js';
import usersRoutes from './routes/users.routes.js';
import logoRoutes from './routes/logo.routes.js';
import bagRoutes from './routes/bag.routes.js';
import pptTemplateRoutes from './routes/ppt-template.routes.js';
import tenantInstellingenRoutes from './routes/tenant-instellingen.routes.js';
import factuurReferentiesRoutes from './routes/factuur-referenties.routes.js';
import downloadsRoutes from './routes/downloads.routes.js';
import pptRoutes from './routes/ppt.routes.js';
import { prisma } from './db.js';

/**
 * Auto-seed: maakt eenmalig de eerste Tenant + BEHEERDER aan als de DB
 * nog geen tenants bevat. Idempotent — bij volgende startups gebeurt er niks.
 *
 * Vereist deze environment variables (anders wordt seed overgeslagen):
 *   SEED_TENANT_NAAM
 *   SEED_TENANT_SLUG
 *   SEED_ADMIN_EMAIL
 *   SEED_ADMIN_PASSWORD
 */
async function autoSeedAlsLeeg(log: FastifyBaseLogger): Promise<void> {
  const cfg = getConfig();

  if (!cfg.SEED_TENANT_NAAM || !cfg.SEED_TENANT_SLUG ||
      !cfg.SEED_ADMIN_EMAIL || !cfg.SEED_ADMIN_PASSWORD) {
    log.info('Auto-seed overgeslagen — SEED_* env vars niet (volledig) ingesteld');
    return;
  }

  try {
    const aantalTenants = await prisma.tenant.count();
    if (aantalTenants > 0) {
      log.info({ aantalTenants }, 'Auto-seed overgeslagen — tenant bestaat al');
      return;
    }

    log.info('Auto-seed: database is leeg, eerste tenant + admin worden aangemaakt...');

    const tenant = await prisma.tenant.create({
      data: {
        naam: cfg.SEED_TENANT_NAAM,
        slug: cfg.SEED_TENANT_SLUG,
      },
    });
    log.info({ tenantId: tenant.id, slug: tenant.slug }, '✓ Tenant aangemaakt');

    const admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: cfg.SEED_ADMIN_EMAIL,
        passwordHash: await hashWachtwoord(cfg.SEED_ADMIN_PASSWORD),
        naam: 'Beheerder',
        rol: 'BEHEERDER',
      },
    });
    log.info({ adminId: admin.id, email: admin.email }, '✓ Beheerder aangemaakt');
  } catch (err) {
    // Niet fataal — server moet alsnog op kunnen komen, anders kunnen we
    // het ook niet meer fixen via een nieuwe deploy.
    log.error({ err }, 'Auto-seed mislukt — server start toch op');
  }
}

async function buildServer() {
  const cfg = getConfig();

  const app = Fastify({
    logger: isProduction()
      ? { level: cfg.LOG_LEVEL }
      : {
          level: cfg.LOG_LEVEL,
          transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
        },
    trustProxy: isProduction(),
    bodyLimit: 5 * 1024 * 1024, // 5 MB (Float32Array timeseries kunnen groot zijn)
  });

  // ===== Security =====
  await app.register(helmet, {
    // CSP wordt door de frontend zelf afgehandeld (Vite serveert die)
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: cfg.ALLOWED_ORIGINS.split(',').map(s => s.trim()),
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // ===== Plugins =====
  await app.register(authPlugin);

  // Auth-routes registreren met selectieve rate limiting:
  //
  //  - /api/auth/login en /users (POST): 30/min — brute-force defense
  //  - /api/auth/me en /api/auth/logout: 200/min globaal — wordt elke pagina-load
  //    aangeroepen voor sessie-verificatie, mag niet de bottleneck zijn
  //
  // Voorheen: ALLE auth-routes hadden 10/min limit, waardoor /me-checks tijdens
  // navigatie de limiet uitputten — gebruikers kregen daarna "Too many requests"
  // bij het volgende login-attempt.
  await app.register(async (scoped) => {
    // Strakker limit alleen op de write/auth-mutating endpoints
    scoped.addHook('onRoute', (route) => {
      if (route.path === '/login' || (route.path === '/users' && route.method === 'POST')) {
        route.config = {
          ...(route.config ?? {}),
          rateLimit: { max: 30, timeWindow: '1 minute' },
        };
      }
    });
    await scoped.register(authRoutes, { prefix: '/api/auth' });
  });

  // ===== Routes =====
  await app.register(projectsRoutes, { prefix: '/api' });
  await app.register(modulesRoutes, { prefix: '/api' });
  await app.register(usersRoutes, { prefix: '/api' });
  await app.register(logoRoutes, { prefix: '/api' });
  await app.register(bagRoutes, { prefix: '/api' });
  await app.register(pptRoutes, { prefix: '/api' });
  await app.register(pptTemplateRoutes, { prefix: '/api' });
  await app.register(tenantInstellingenRoutes, { prefix: '/api' });
  await app.register(factuurReferentiesRoutes, { prefix: '/api' });
  await app.register(downloadsRoutes, { prefix: '/api' });

  // Health & version
  app.get('/api/health', async () => {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      time: new Date().toISOString(),
    };
  });

  // Globaal 404
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'Endpoint niet gevonden' });
  });

  // Globaal error
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'Onverwachte fout');
    if (reply.statusCode < 400) reply.code(500);
    reply.send({
      error: 'Server-fout',
      message: isProduction() ? undefined : err.message,
    });
  });

  return app;
}

async function start() {
  const cfg = getConfig();
  const app = await buildServer();

  // Eerst seeden (als DB leeg is), daarna pas requests accepteren
  await autoSeedAlsLeeg(app.log);

  // RESET_PASSWORD_FOR + RESET_PASSWORD_TO env-vars — eenmalige wachtwoord-reset
  // via Render env-vars zonder shell nodig.
  //
  // Gebruik:
  //   1. Zet in Render dashboard: RESET_PASSWORD_FOR=email@adres.nl
  //                               RESET_PASSWORD_TO=nieuwwachtwoord
  //   2. Herstart de service (auto na env-var change)
  //   3. Log toont "✓ wachtwoord gereset voor email@adres.nl"
  //   4. VERWIJDER beide env-vars uit Render zodra je weer kunt inloggen
  await resetWachtwoordViaEnv(app.log);

  try {
    await app.listen({ port: cfg.PORT, host: cfg.HOST });
    app.log.info(`🚀 Sportief Opgewekt API draait op ${cfg.HOST}:${cfg.PORT}`);
  } catch (err) {
    app.log.fatal({ err }, 'Kon server niet starten');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Afsluiten...');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Eenmalige password-reset via env-vars. Veilig omdat:
 *  - Alleen wie Render-toegang heeft kan env-vars zetten
 *  - Render bewaart env-vars encrypted
 *  - Bart kan ze direct na gebruik verwijderen (volgende deploy = geen reset)
 *
 * Logt duidelijk wat er gebeurt zodat Bart in Render-logs ziet of het werkte.
 */
async function resetWachtwoordViaEnv(log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void; error: (o: object, m: string) => void }) {
  const email = process.env.RESET_PASSWORD_FOR;
  const nieuwWachtwoord = process.env.RESET_PASSWORD_TO;
  if (!email || !nieuwWachtwoord) return; // niet geconfigureerd, sla over

  if (nieuwWachtwoord.length < 6) {
    log.error({ email }, '❌ RESET_PASSWORD_TO te kort (minimaal 6 tekens)');
    return;
  }

  try {
    const gebruiker = await prisma.user.findFirst({ where: { email } });
    if (!gebruiker) {
      log.warn({ email }, `⚠ Geen gebruiker gevonden voor reset-email — controleer spelling`);
      return;
    }
    const { hashWachtwoord: hash } = await import('./plugins/auth.js');
    await prisma.user.update({
      where: { id: gebruiker.id },
      data: { passwordHash: await hash(nieuwWachtwoord) },
    });
    log.info({ email }, `✓ wachtwoord gereset — VERWIJDER nu RESET_PASSWORD_FOR + RESET_PASSWORD_TO uit Render env-vars`);
  } catch (err) {
    log.error({ err, email }, 'Reset mislukt');
  }
}

// Alleen starten als dit het main-bestand is (niet bij import voor tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };