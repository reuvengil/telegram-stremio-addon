import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// One log line per request, emitted after it finishes so we can include the
// status code and timing. Debug-level for normal traffic (quiet by default
// in production, see main.ts) but escalated so failures are never missed.
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const line = `${method} ${originalUrl} ${statusCode} - ${Date.now() - start}ms`;
      if (statusCode >= 500) this.logger.error(line);
      else if (statusCode >= 400) this.logger.warn(line);
      else this.logger.debug(line);
    });

    next();
  }
}
