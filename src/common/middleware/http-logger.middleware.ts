import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Http');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;

      if (statusCode >= 500) {
        this.logger.error(`${method} ${originalUrl} ${statusCode} ${duration}ms`);
      } else if (statusCode >= 400) {
        this.logger.warn(`${method} ${originalUrl} ${statusCode} ${duration}ms`);
      } else {
        this.logger.log(`${method} ${originalUrl} ${statusCode} ${duration}ms`);
      }
    });

    next();
  }
}