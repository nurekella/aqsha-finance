import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

const PASSWORD_CHANGE_ALLOWLIST = new Set<string>([
  'POST /api/auth/change-password',
  'POST /api/auth/logout',
  'GET /api/me',
]);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      if (err instanceof Error) throw err;
      throw new UnauthorizedException();
    }
    const authUser = user as unknown as AuthUser;
    if (authUser.mustChangePassword) {
      const req = context.switchToHttp().getRequest<{ method: string; url: string }>();
      const key = `${req.method} ${req.url.split('?')[0]}`;
      if (!PASSWORD_CHANGE_ALLOWLIST.has(key)) {
        throw new ForbiddenException({
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'You must change your temporary password before continuing.',
        });
      }
    }
    return user;
  }
}
