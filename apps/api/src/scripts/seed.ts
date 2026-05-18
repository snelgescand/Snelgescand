/**
 * Seed-script.
 *
 * Maakt de eerste tenant + BEHEERDER aan als de DB leeg is.
 * Idempotent: doet niets als er al een tenant bestaat.
 *
 * Gebruik:
 *   SEED_TENANT_NAAM="Mijn Adviesbureau" \
 *   SEED_TENANT_SLUG=mijn-bureau \
 *   SEED_ADMIN_EMAIL=admin@example.nl \
 *   SEED_ADMIN_PASSWORD=een-lang-en-veilig-wachtwoord \
 *   pnpm tsx src/scripts/seed.ts
 */

import { prisma } from '../db.js';
import { hashWachtwoord } from '../plugins/auth.js';
import { getConfig } from '../config.js';

async function main() {
  const cfg = getConfig();

  if (!cfg.SEED_TENANT_NAAM || !cfg.SEED_TENANT_SLUG ||
      !cfg.SEED_ADMIN_EMAIL || !cfg.SEED_ADMIN_PASSWORD) {
    console.error('Vul SEED_TENANT_NAAM, SEED_TENANT_SLUG, SEED_ADMIN_EMAIL en SEED_ADMIN_PASSWORD in.');
    process.exit(1);
  }

  const bestaandeTenant = await prisma.tenant.count();
  if (bestaandeTenant > 0) {
    console.log('Er bestaat al een tenant — seed slaat over.');
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      naam: cfg.SEED_TENANT_NAAM,
      slug: cfg.SEED_TENANT_SLUG,
    },
  });
  console.log(`✓ Tenant aangemaakt: ${tenant.naam} (${tenant.slug})`);

  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: cfg.SEED_ADMIN_EMAIL,
      passwordHash: await hashWachtwoord(cfg.SEED_ADMIN_PASSWORD),
      naam: 'Beheerder',
      rol: 'BEHEERDER',
    },
  });
  console.log(`✓ Admin aangemaakt: ${admin.email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
