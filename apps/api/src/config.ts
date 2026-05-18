/**
 * Centrale config & env-validatie.
 *
 * Faalt direct bij start als verplichte vars ontbreken — nooit een
 * "ergens halverwege" crash door undefined env.
 */

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // JWT-secret voor cookie-tokens. Min 32 tekens.
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  COOKIE_DOMAIN: z.string().optional(),

  // CORS — komma-gescheiden lijst van origins
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Welke seed-rekening de eerste BEHEERDER krijgt — alleen voor first-run.
  SEED_TENANT_NAAM: z.string().optional(),
  SEED_TENANT_SLUG: z.string().optional(),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),

  // Optionele third-party API-keys (BAG/PDOK is publiek, EPEX vereist key)
  ENTSO_E_API_TOKEN: z.string().optional(),

  // Pad naar python-pptx sidecar (sprint 6)
  PPTX_SIDECAR_SCRIPT: z.string().default('./scripts/generate_pptx.py'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Ongeldige environment-variabelen:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === 'production';
}
