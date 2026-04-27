import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

async function main(): Promise<void> {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error('Usage: node dist/cli/create-admin.js <email> <password>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role: UserRole.admin,
        mustChangePassword: false,
        disabledAt: null,
      },
      create: {
        email,
        passwordHash,
        role: UserRole.admin,
        mustChangePassword: false,
        displayName: 'Admin',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: null,
        entity: 'user',
        entityId: user.id,
        action: 'user.created',
        diff: { source: 'cli:create-admin', email },
      },
    });

    // eslint-disable-next-line no-console
    console.log(`Admin ready: ${user.email} (id=${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
