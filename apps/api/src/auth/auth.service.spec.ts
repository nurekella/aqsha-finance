import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

type Prisma = {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  refreshToken: {
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

function buildPrismaMock(): Prisma {
  return {
    user: { findUnique: jest.fn(), update: jest.fn() },
    refreshToken: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

describe('AuthService.changePassword', () => {
  let service: AuthService;
  let prisma: Prisma;
  const audit = { record: jest.fn() };
  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn(), decode: jest.fn() } as unknown as JwtService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
    });
    service = new AuthService(prisma as never, audit as never, jwt, config);
    audit.record.mockReset();
  });

  it('rejects wrong current password', async () => {
    const hash = await argon2.hash('actual-password', {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash });
    await expect(
      service.changePassword('u1', 'wrong-password', 'new-password-123', { ipAddress: null, userAgent: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when user is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.changePassword('missing', 'a', 'new-password-123', { ipAddress: null, userAgent: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates password, clears flag, revokes refresh tokens, and writes audit', async () => {
    const original = 'actual-password';
    const hash = await argon2.hash(original, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash, mustChangePassword: true });
    prisma.user.update.mockResolvedValue({ id: 'u1', mustChangePassword: false });

    const newPassword = 'new-strong-password';
    await service.changePassword('u1', original, newPassword, {
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        mustChangePassword: false,
        passwordHash: expect.any(String),
      }),
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'password.changed', userId: 'u1' }),
    );
  });
});
