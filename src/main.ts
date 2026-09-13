// Must run before anything else - DatabaseModule reads process.env.DATABASE_URL
// at import time (inside the TypeOrmModule.forRoot() call in its decorator),
// so .env has to be loaded before AppModule (and its imports) are required.
import 'dotenv/config';
import 'reflect-metadata';
import { Logger, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Single knob for verbosity - LOG_LEVEL names the least severe level to
// show, and everything more severe than it is included too. Defaults to
// 'log' (quiet); set LOG_LEVEL=debug locally for the full request/telegram
// flow traces added throughout the app.
const LOG_LEVEL_SEVERITY: LogLevel[] = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
];
const configuredLevel = process.env.LOG_LEVEL as LogLevel | undefined;
const levelIndex = configuredLevel
  ? LOG_LEVEL_SEVERITY.indexOf(configuredLevel)
  : -1;
const LOG_LEVELS: LogLevel[] = LOG_LEVEL_SEVERITY.slice(
  levelIndex === -1 ? LOG_LEVEL_SEVERITY.indexOf('log') : levelIndex,
);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: LOG_LEVELS });
  const logger = new Logger('Bootstrap');

  // Stremio calls these endpoints cross-origin from the desktop/mobile app.
  app.enableCors();

  const swaggerPath = 'docs';
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Telegram Stremio Addon')
      .setDescription(
        'Wizard (login/channel setup) and Stremio addon protocol endpoints.',
      )
      .setVersion('1.0.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath, app, document);
    logger.log(`Swagger docs enabled at /${swaggerPath}`);
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Telegram Stremio addon running on port ${port}`);
  logger.log(`Configure at: http://localhost:${port}/configure`);
}

void bootstrap().catch((err: unknown) => {
  new Logger('Bootstrap').error(
    'Application failed to start',
    err instanceof Error ? err.stack : String(err),
  );
  process.exit(1);
});
