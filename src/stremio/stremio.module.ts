import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelEntity } from '../db/entities/channel.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { StremioController } from './stremio.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChannelEntity]), TelegramModule],
  controllers: [StremioController],
})
export class StremioModule {}
