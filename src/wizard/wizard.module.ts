import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelEntity } from '../db/entities/channel.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { WizardController } from './wizard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChannelEntity]), TelegramModule],
  controllers: [WizardController],
})
export class WizardModule {}
