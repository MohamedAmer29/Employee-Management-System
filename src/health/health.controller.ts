import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Application health check',
    description:
      'Reports PostgreSQL and Redis availability. Redis being down is reported as a degraded state, not a failure, because the API can still serve requests from PostgreSQL.',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy or degraded' })
  @ApiResponse({ status: 503, description: 'Service is unavailable' })
  async check(@Res({ passthrough: true }) res: Response) {
    const report = await this.healthService.check();

    if (report.database === 'down') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      success: report.database === 'up',
      data: {
        database: report.database,
        redis: report.redis,
        degraded: report.degraded,
      },
      details: report.details,
      timestamp: new Date().toISOString(),
    };
  }
}
