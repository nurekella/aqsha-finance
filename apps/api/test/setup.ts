import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

export async function applyMigrationsAndReset(): Promise<void> {
  execSync('pnpm prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction([
      prisma.refreshToken.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}
