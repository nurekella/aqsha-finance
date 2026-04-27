import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser, AuthUser } from './decorators/current-user.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { REFRESH_COOKIE_NAME } from './strategies/jwt-refresh.strategy';
import { AuditService } from '../audit/audit.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; mustChangePassword: boolean }> {
    const result = await this.auth.login(dto.email, dto.password, contextFrom(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return {
      accessToken: result.accessToken,
      mustChangePassword: result.mustChangePassword,
    };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const token = readRefreshCookie(req);
    if (!token) throw new UnauthorizedException();
    const result = await this.auth.rotateRefreshToken(token, contextFrom(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = readRefreshCookie(req);
    if (token) await this.auth.revokeRefreshToken(token);
    this.clearRefreshCookie(res);
    await this.audit.record({
      userId: user.id,
      entity: 'auth',
      entityId: user.id,
      action: 'auth.logout',
      ipAddress: ipFrom(req),
      userAgent: uaFrom(req),
    });
    return { ok: true };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, contextFrom(req));
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      expires: expiresAt,
      path: '/api/auth',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE_NAME];
}

function ipFrom(req: Request): string | null {
  return (req.ip ?? req.socket?.remoteAddress) ?? null;
}

function uaFrom(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
}

function contextFrom(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return { ipAddress: ipFrom(req), userAgent: uaFrom(req) };
}
