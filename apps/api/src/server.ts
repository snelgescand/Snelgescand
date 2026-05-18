/**
 * Fastify server entrypoint.
 *
 * Start volgorde:
 *   1. Config validatie (faalt fast)
 *   2. Logger setup (pino-pretty in dev, JSON in prod)
 *   3. Plugins: helmet, cors, cookie+jwt+auth, rate-limit
 *   4. Routes registreren
 *   5. Health check
 *   6. Luister op PORT
 *   7. Graceful shutdown bij SIGTERM/SIGINT
 */

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getConfig, isProduction } from './config.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import modulesRoutes from './routes/modules.routes.js';
import pptRoutes from './routes/ppt.routes.js';
import { prisma } from './db.js';

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
  await app.register(pptRoutes, { prefix: '/api' });

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
