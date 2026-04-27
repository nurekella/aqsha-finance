import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { RequestContext } from '../auth/auth.service';

const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  locale: true,
  timezone: true,
  mustChangePassword: true,
  disabledAt: true,
  lastLoginAt: true,
  createdById: true,
  createdAt: true,
} as const;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof PUBLIC_USER_FIELDS }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ items: PublicUser[]; total: number; page: number; limit: number }> {
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_USER_FIELDS,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_FIELDS,
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  async create(
    dto: CreateUserDto,
    creator: User,
    ctx: RequestContext,
  ): Promise<{ user: PublicUser; temporaryPassword: string }> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const temporaryPassword = generateTempPassword();
    const passwordHash = await AuthService.hashPassword(temporaryPassword);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        role: dto.role,
        passwordHash,
        mustChangePassword: true,
        createdById: creator.id,
      },
      select: PUBLIC_USER_FIELDS,
    });

    await this.audit.record({
      userId: creator.id,
      entity: 'user',
      entityId: user.id,
      action: 'user.created',
      diff: { email: user.email, role: user.role, displayName: user.displayName },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { user, temporaryPassword };
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: User,
    ctx: RequestContext,
  ): Promise<PublicUser> {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();

    if (dto.role && dto.role !== UserRole.admin && before.role === UserRole.admin) {
      await this.assertNotLastAdmin(before.id);
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.role !== undefined) data.role = dto.role;

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: PUBLIC_USER_FIELDS,
    });

    await this.audit.record({
      userId: actor.id,
      entity: 'user',
      entityId: id,
      action: 'user.updated',
      diff: pickChanges(before, dto),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return user;
  }

  async resetPassword(
    id: string,
    actor: User,
    ctx: RequestContext,
  ): Promise<{ temporaryPassword: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();

    const temporaryPassword = generateTempPassword();
    const passwordHash = await AuthService.hashPassword(temporaryPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      userId: actor.id,
      entity: 'user',
      entityId: id,
      action: 'user.password.reset',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { temporaryPassword };
  }

  async disable(id: string, actor: User, ctx: RequestContext): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException('You cannot disable yourself');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    if (user.role === UserRole.admin) await this.assertNotLastAdmin(id);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { disabledAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      userId: actor.id,
      entity: 'user',
      entityId: id,
      action: 'user.disabled',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  async enable(id: string, actor: User, ctx: RequestContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    await this.prisma.user.update({
      where: { id },
      data: { disabledAt: null },
    });
    await this.audit.record({
      userId: actor.id,
      entity: 'user',
      entityId: id,
      action: 'user.enabled',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  async remove(id: string, actor: User, ctx: RequestContext): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException('You cannot delete yourself');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    if (user.role === UserRole.admin) await this.assertNotLastAdmin(id);

    await this.prisma.user.delete({ where: { id } });

    await this.audit.record({
      userId: actor.id,
      entity: 'user',
      entityId: id,
      action: 'user.deleted',
      diff: { email: user.email },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  private async assertNotLastAdmin(excludingUserId: string): Promise<void> {
    const remaining = await this.prisma.user.count({
      where: {
        role: UserRole.admin,
        disabledAt: null,
        id: { not: excludingUserId },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException('Cannot remove the last active admin');
    }
  }
}

function generateTempPassword(): string {
  // 9 random bytes → ~12 chars in base64url
  return randomBytes(9).toString('base64url');
}

function pickChanges(before: User, dto: UpdateUserDto): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (dto.displayName !== undefined && dto.displayName !== before.displayName) {
    changes.displayName = { from: before.displayName, to: dto.displayName };
  }
  if (dto.role !== undefined && dto.role !== before.role) {
    changes.role = { from: before.role, to: dto.role };
  }
  return changes;
}
