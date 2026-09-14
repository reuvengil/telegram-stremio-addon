import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from './db/database.module';
import { TelegramModule } from './telegram/telegram.module';
import { WizardModule } from './wizard/wizard.module';
import { StremioModule } from './stremio/stremio.module';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { HealthController } from './common/health.controller';

@Module({
  imports: [DatabaseModule, TelegramModule, WizardModule, StremioModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
