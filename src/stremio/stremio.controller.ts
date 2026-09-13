import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { ChannelEntity } from '../db/entities/channel.entity';
import { TelegramService } from '../telegram/telegram.service';
import { streamDocumentToResponse } from '../telegram/stream-document';

@ApiTags('stremio')
@Controller(':accountId')
export class StremioController {
  private readonly logger = new Logger(StremioController.name);

  constructor(
    private readonly telegram: TelegramService,
    @InjectRepository(ChannelEntity)
    private readonly channels: Repository<ChannelEntity>,
  ) {}

  private seriesId(channel: ChannelEntity) {
    return `tg${channel.channelId}`;
  }

  @Get('manifest.json')
  getManifest(@Req() req: Request) {
    // Not a Stremio-protocol field - each account's manifest lives at a
    // per-account URL created by the wizard, so there's no per-account
    // "configure" page to wire up as a native Stremio behaviorHint. This
    // just gives anyone inspecting the manifest a way to find the wizard.
    const setupUrl = `${req.protocol}://${req.get('host')}/configure`;

    return {
      id: 'community.telegram.stremio.adapter',
      version: '1.0.0',
      name: 'Telegram Channels',
      description:
        'Exposes configured Telegram channels as Stremio series, streamed directly from Telegram.',
      resources: ['catalog', 'meta', 'stream'],
      types: ['series'],
      catalogs: [
        { type: 'series', id: 'telegram_channels', name: 'Telegram Channels' },
      ],
      idPrefixes: ['tg'],
      behaviorHints: { adult: false, p2p: false },
      setupUrl,
    };
  }

  @Get('catalog/series/telegram_channels.json')
  async getCatalog(@Param('accountId') accountId: string) {
    const channels = await this.channels.find({ where: { accountId } });
    return {
      metas: channels.map((c) => ({
        id: this.seriesId(c),
        type: 'series',
        name: c.title,
        description: `Videos from the Telegram ${c.kind} "${c.title}", in post order.`,
      })),
    };
  }

  @Get('meta/series/:seriesId.json')
  async getMeta(
    @Param('accountId') accountId: string,
    @Param('seriesId') seriesIdParam: string,
  ) {
    const channel = await this.findChannelBySeriesId(accountId, seriesIdParam);
    const videos = await this.telegram.listChannelVideos(
      accountId,
      channel.channelId,
      channel.accessHash,
    );

    return {
      meta: {
        id: seriesIdParam,
        type: 'series',
        name: channel.title,
        videos: videos.map((v, i) => ({
          id: `${seriesIdParam}:${v.messageId}`,
          title: v.title,
          season: 1,
          episode: i + 1,
        })),
      },
    };
  }

  @Get('stream/series/:videoId.json')
  async getStream(
    @Param('accountId') accountId: string,
    @Param('videoId') videoIdParam: string,
    @Req() req: Request,
  ) {
    const [seriesIdPart, msgId] = videoIdParam.split(':');
    const channel = await this.findChannelBySeriesId(accountId, seriesIdPart);
    if (!msgId) return { streams: [] };

    const host = `${req.protocol}://${req.get('host')}`;
    return {
      streams: [
        {
          title: channel.title,
          url: `${host}/${accountId}/raw/${seriesIdPart}/${msgId}`,
          behaviorHints: { notWebReady: false },
        },
      ],
    };
  }

  // The actual byte stream. Fetches the message fresh each time (so
  // fileReference - which Telegram expires periodically - is always
  // current) and proxies it with Range support.
  @Get('raw/:seriesId/:msgId')
  async getRaw(
    @Param('accountId') accountId: string,
    @Param('seriesId') seriesIdParam: string,
    @Param('msgId') msgId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const channel = await this.findChannelBySeriesId(accountId, seriesIdParam);
    this.logger.debug(
      `Streaming message ${msgId} from channel ${channel.channelId} (account ${accountId})`,
    );
    const { client, document } = await this.telegram.getVideoMessage(
      accountId,
      channel.channelId,
      channel.accessHash,
      Number(msgId),
    );
    await streamDocumentToResponse(client, document, req, res);
  }

  private async findChannelBySeriesId(accountId: string, seriesId: string) {
    const channelId = seriesId.replace(/^tg/, '');
    const channel = await this.channels.findOne({
      where: { accountId, channelId },
    });
    if (!channel) {
      this.logger.warn(
        `Unknown series "${seriesId}" requested for account ${accountId}`,
      );
      throw new NotFoundException('Unknown series for this account');
    }
    return channel;
  }
}
