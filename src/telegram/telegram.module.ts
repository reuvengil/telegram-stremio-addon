import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../db/entities/account.entity';
import { TelegramService } from './telegram.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
