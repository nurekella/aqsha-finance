import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(RolesGuard)
@Roles(UserRole.admin)
@Controller('admin/users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const p = clampInt(page, 1, 1, 1_000_000);
    const l = clampInt(limit, 20, 1, 100);
    return this.users.list(p, l, search?.trim() || undefined);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() current: AuthUser,
    @Req() req: Request,
  ) {
    const creator = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    return this.users.create(dto, creator, contextFrom(req));
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getById(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() current: AuthUser,
    @Req() req: Request,
  ) {
    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    return this.users.update(id, dto, actor, contextFrom(req));
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: AuthUser,
    @Req() req: Request,
  ) {
    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    return this.users.resetPassword(id, actor, contextFrom(req));
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  async disable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: AuthUser,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    await this.users.disable(id, actor, contextFrom(req));
    return { ok: true };
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  async enable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: AuthUser,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    await this.users.enable(id, actor, contextFrom(req));
    return { ok: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: AuthUser,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    await this.users.remove(id, actor, contextFrom(req));
    return { ok: true };
  }
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function contextFrom(req: Request): { ipAddress: string | null; userAgent: string | null } {
  const ipAddress = req.ip ?? req.socket?.remoteAddress ?? null;
  const ua = req.headers['user-agent'];
  return { ipAddress, userAgent: typeof ua === 'string' ? ua : null };
}
