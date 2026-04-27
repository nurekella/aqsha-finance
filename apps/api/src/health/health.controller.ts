import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'aqsha-api',
      version: process.env.APP_VERSION ?? '0.1.0',
      uptime: process.uptime(),
    };
  }
}
