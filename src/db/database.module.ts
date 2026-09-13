import { readFileSync } from 'fs';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from './entities/account.entity';
import { ChannelEntity } from './entities/channel.entity';

// Managed providers (Aiven, etc.) sign their certs with a CA that isn't in
// Node's default trust store, so DATABASE_URL should NOT carry ?sslmode=...
// - pg re-parses the URL after merging options and its sslmode would
// silently clobber the `ssl` config below. Point DATABASE_SSL_CA_PATH at
// the provider's downloaded CA cert instead; leave it unset for a plain
// (e.g. local docker-compose) Postgres with no TLS.
const sslCaPath = process.env.DATABASE_SSL_CA_PATH;

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: sslCaPath ? { ca: readFileSync(sslCaPath, 'utf8') } : undefined,
      entities: [AccountEntity, ChannelEntity],
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      migrationsRun: true,
      synchronize: false,
      logging: ['migration'],
      maxQueryExecutionTime: 1000,
    }),
  ],
})
export class DatabaseModule {}
