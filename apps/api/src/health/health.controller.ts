import { Controller, Get } from '@nestjs/common';

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
