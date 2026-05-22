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

  // Strakker rate limit op auth endpoints (brute-force defense)
  await app.register(async (scoped) => {
    await scoped.register(rateLimit, {
      max: 10,
      timeWindow: '1 minute',
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

// Alleen starten als dit het main-bestand is (niet bij import voor tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };