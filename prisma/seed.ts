import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_USERNAME = 'admin';
const SEED_PASSWORD = 'admin123';
const SEED_ROLE = 'superadmin';
const DEFAULT_TENANT_SLUG = 'default';
const DEFAULT_TENANT_NAME = 'Default Tenant';
const BCRYPT_ROUNDS = 12;

async function main() {
  // Ensure the default tenant exists (idempotent).
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {},
    create: {
      slug: DEFAULT_TENANT_SLUG,
      name: DEFAULT_TENANT_NAME,
      features: {},
    },
  });

  const existing = await prisma.user.findUnique({
    where: {
      tenantId_username: { tenantId: tenant.id, username: SEED_USERNAME },
    },
  });

  if (existing) {
    console.log(
      `[seed] User "${SEED_USERNAME}" already exists in tenant "${DEFAULT_TENANT_SLUG}" — skipping.`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: SEED_USERNAME,
      passwordHash,
      role: SEED_ROLE,
    },
  });

  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║      SEED: Superadmin user created    ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  id:       ${String(user.id).padEnd(27)}║`);
  console.log(`║  tenant:   ${DEFAULT_TENANT_SLUG.padEnd(27)}║`);
  console.log(`║  username: ${SEED_USERNAME.padEnd(27)}║`);
  console.log(`║  password: ${SEED_PASSWORD.padEnd(27)}║`);
  console.log(`║  role:     ${SEED_ROLE.padEnd(27)}║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
