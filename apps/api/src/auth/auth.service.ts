import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AccessTokenPayload } from './strategies/jwt-access.strategy';
import type { RefreshTokenPayload } from './strategies/jwt-refresh.strategy';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  mustChangePassword: boolean;
  user: User;
}

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class AuthService {
  private readonly accessTtl: string;
  private readonly refreshTtl: string;
  private readonly refreshSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessTtl = config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    this.refreshTtl = config.get<string>('JWT_REFRESH_TTL') ?? '30d';
    const refreshSecret = config.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) throw new Error('JWT_REFRESH_SECRET is not configured');
    this.refreshSecret = refreshSecret;
  }

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async login(
    email: string,
    password: string,
    ctx: RequestContext,
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.disabledAt) {
      await this.audit.record({
        userId: user?.id ?? null,
        entity: 'auth',
        entityId: email,
        action: 'auth.login.failed',
        diff: { reason: !user ? 'unknown_email' : 'disabled' },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.audit.record({
        userId: user.id,
        entity: 'auth',
        entityId: user.id,
        action: 'auth.login.failed',
        diff: { reason: 'bad_password' },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user, ctx);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      userId: user.id,
      entity: 'auth',
      entityId: user.id,
      action: 'auth.login.success',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    if (user.mustChangePassword) {
      await this.audit.record({
        userId: user.id,
        entity: 'auth',
        entityId: user.id,
        action: 'password.change.required',
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }

    return {
      ...tokens,
      mustChangePassword: user.mustChangePassword,
      user,
    };
  }

  async rotateRefreshToken(
    token: string,
    ctx: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string; refreshExpiresAt: Date }> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = sha256(token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.id !== payload.jti || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token not recognised');
    }
    if (stored.revokedAt) {
      // possible token reuse → revoke all sessions for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reused; all sessions revoked');
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.disabledAt) throw new UnauthorizedException('User unavailable');

    // revoke old, mint new (rotation)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const fresh = await this.issueTokens(user, ctx);
    return {
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      refreshExpiresAt: fresh.refreshExpiresAt,
    };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = sha256(token);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const ok = await argon2.verify(user.passwordHash, currentPassword);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    const sameAsOld = await argon2.verify(user.passwordHash, newPassword);
    if (sameAsOld) {
      throw new BadRequestException('New password must differ from the current one');
    }

    const passwordHash = await AuthService.hashPassword(newPassword);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    await this.revokeAllUserSessions(userId);

    await this.audit.record({
      userId,
      entity: 'user',
      entityId: userId,
      action: 'password.changed',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  private async issueTokens(
    user: User,
    ctx: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string; refreshExpiresAt: Date }> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      pwd_change_required: user.mustChangePassword,
    };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      expiresIn: this.accessTtl,
    });

    const jti = randomUUID();
    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtl,
    });

    const decoded = this.jwt.decode<{ exp?: number }>(refreshToken);
    const refreshExpiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + parseDurationMs(this.refreshTtl));

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
      } satisfies Prisma.RefreshTokenUncheckedCreateInput,
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * multiplier;
}
