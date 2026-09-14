import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Backs the Docker HEALTHCHECK (see Dockerfile) - checks the one external
// dependency that actually matters here, Postgres, rather than just
// confirming the HTTP server itself is up.
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('health')
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch (err) {
      this.logger.error(
        'Health check failed - database unreachable',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException({
        status: 'error',
        detail: 'database unreachable',
      });
    }
  }
}
