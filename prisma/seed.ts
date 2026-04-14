import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_USERNAME = 'admin';
const SEED_PASSWORD = 'admin123';
const BCRYPT_ROUNDS = 12;

async function main() {
  const existing = await prisma.user.findUnique({
    where: { username: SEED_USERNAME },
  });

  if (existing) {
    console.log(`[seed] User "${SEED_USERNAME}" already exists — skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      username: SEED_USERNAME,
      passwordHash,
      role: 'admin',
    },
  });

  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║        SEED: Admin user created       ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  id:       ${String(user.id).padEnd(27)}║`);
  console.log(`║  username: ${SEED_USERNAME.padEnd(27)}║`);
  console.log(`║  password: ${SEED_PASSWORD.padEnd(27)}║`);
  console.log(`║  role:     ${'admin'.padEnd(27)}║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
