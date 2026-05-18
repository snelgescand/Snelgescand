/**
 * Auth-plugin: cookie-based JWT.
 *
 * Sessie zit in een httpOnly + secure + sameSite=lax cookie, niet in
 * localStorage. Reden: bescherming tegen XSS-credential-theft.
 *
 * Token-payload:
 *   { sub: userId, tenantId, rol }
 *
 * Iedere request krijgt via een onRequest hook `req.user` ingevuld als
 * de cookie geldig is, of null. Routes die auth verplicht stellen
 * gebruiken de `requireAuth` preHandler.
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import argon2 from 'argon2';
import { getConfig, isProduction } from '../config.js';

export interface AuthUser {
  sub: string;        // userId
  tenantId: string;
  rol: 'ADVISEUR' | 'BEHEERDER';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireBeheerder: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const COOKIE_NAME = 'sopg_session';

async function authPlugin(app: FastifyInstance) {
  const cfg = getConfig();

  await app.register(fastifyCookie, {
    secret: cfg.COOKIE_SECRET,
  });

  await app.register(fastifyJwt, {
    secret: cfg.JWT_SECRET,
    cookie: {
      cookieName: COOKIE_NAME,
      signed: true,
    },
    sign: { expiresIn: '7d' },
  });

  // Probeer bij elke request te decoden — zonder te falen.
  app.addHook('onRequest', async (req) => {
    try {
      await req.jwtVerify();
    } catch {
      // anonieme request — req.user blijft undefined
    }
  });

  // Decorators
  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      reply.code(401).send({ error: 'Niet ingelogd' });
    }
  });

  app.decorate('requireBeheerder', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      reply.code(401).send({ error: 'Niet ingelogd' });
      return;
    }
    if (req.user.rol !== 'BEHEERDER') {
      reply.code(403).send({ error: 'Alleen beheerders' });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });

/**
 * Helpers om sessies te zetten / wissen.
 */
export function zetSessieCookie(reply: FastifyReply, user: AuthUser): void {
  const token = reply.server.jwt.sign(user);
  const cfg = getConfig();
  // Cross-site setup (frontend op snelgescand.nl, backend op *.onrender.com):
  //  - sameSite: 'none'  → browser stuurt cookie wel mee bij cross-site fetch
  //  - secure: true       → vereist bij sameSite=none, mag dus alleen via HTTPS
  //  - domain weglaten als COOKIE_DOMAIN niet matcht met host die cookie zet,
  //    anders weigert de browser de cookie. Voor onrender.com: laat leeg.
  const useCrossSite = isProduction();
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: useCrossSite,
    sameSite: useCrossSite ? 'none' : 'lax',
    path: '/',
    domain: cfg.COOKIE_DOMAIN || undefined,
    signed: true,
    maxAge: 60 * 60 * 24 * 7, // 7 dagen
  });
}

export function wisSessieCookie(reply: FastifyReply): void {
  const cfg = getConfig();
  reply.clearCookie(COOKIE_NAME, {
    path: '/',
    domain: cfg.COOKIE_DOMAIN || undefined,
  });
}

/**
 * Wachtwoord-helpers (argon2id).
 */
export async function hashWachtwoord(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: 19_456,  // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifieerWachtwoord(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}
