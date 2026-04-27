import { Controller, Get, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getMe(@CurrentUser() current: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: current.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        locale: true,
        timezone: true,
        mustChangePassword: true,
      },
    });
    if (!user) throw new NotFoundException();
    return user;
  }
}
