import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { join } from 'path';
import { TelegramService } from '../telegram/telegram.service';
import { ChannelEntity } from '../db/entities/channel.entity';

@ApiTags('wizard')
@Controller()
export class WizardController {
  private readonly logger = new Logger(WizardController.name);

  constructor(
    private readonly telegram: TelegramService,
    @InjectRepository(ChannelEntity)
    private readonly channels: Repository<ChannelEntity>,
  ) {}

  @ApiExcludeEndpoint()
  @Get(['/', '/configure'])
  serveWizard(@Res() res: Response) {
    res.sendFile(join(__dirname, '..', 'public', 'wizard.html'));
  }

  @Post('/api/login/start')
  startLogin() {
    const loginId = this.telegram.startLogin();
    this.logger.log(`QR login started (loginId=${loginId})`);
    return { loginId };
  }

  @Get('/api/login/:id/status')
  getLoginStatus(@Param('id') id: string) {
    return this.telegram.getLoginStatus(id);
  }

  @Post('/api/login/:id/password')
  submitPassword(@Param('id') id: string, @Body('password') password: string) {
    this.telegram.submitPassword(id, password);
    return { ok: true };
  }

  @Get('/api/accounts/:accountId/dialogs')
  async listDialogs(@Param('accountId') accountId: string) {
    this.logger.debug(`Wizard requested dialogs for account ${accountId}`);
    return this.telegram.listDialogs(accountId);
  }

  @Post('/api/accounts/:accountId/channels')
  async saveChannels(
    @Param('accountId') accountId: string,
    @Body('channels')
    chosen: {
      id: string;
      accessHash: string;
      title: string;
      kind: 'channel' | 'group';
    }[],
  ) {
    // Replace this account's channel list wholesale - simplest mental
    // model for "here's what I want exposed" on every save.
    await this.channels.delete({ accountId });
    const rows = chosen.map((c) =>
      this.channels.create({
        accountId,
        channelId: c.id,
        accessHash: c.accessHash,
        title: c.title,
        kind: c.kind,
      }),
    );
    await this.channels.save(rows);
    this.logger.log(`Saved ${rows.length} channel(s) for account ${accountId}`);
    return { ok: true, count: rows.length };
  }
}
