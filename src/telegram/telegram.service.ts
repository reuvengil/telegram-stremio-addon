import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import bigInt from 'big-integer';
import { AccountEntity } from '../db/entities/account.entity';
import { LoginSessionState } from './login-session';

const MAX_MESSAGES_PER_CHANNEL = 500;

export interface DialogSummary {
  id: string;
  accessHash: string;
  title: string;
  kind: 'channel' | 'group';
}

export interface VideoSummary {
  messageId: number;
  title: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  private readonly apiId = Number(process.env.TELEGRAM_API_ID);
  private readonly apiHash = process.env.TELEGRAM_API_HASH as string;

  // In-progress QR logins, keyed by a short-lived loginId the wizard polls.
  private readonly loginSessions = new Map<string, LoginSessionState>();

  // Connected, authorized clients, keyed by accountId. This is a
  // performance cache only - if it's empty (fresh boot after a crash),
  // getClientForAccount() below rebuilds it from Postgres transparently.
  private readonly clientPool = new Map<string, TelegramClient>();

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {
    if (!this.apiId || !this.apiHash) {
      throw new Error('TELEGRAM_API_ID / TELEGRAM_API_HASH must be set.');
    }
  }

  // ---------- QR login flow ----------

  startLogin(): string {
    const loginId = randomUUID();
    const client = new TelegramClient(
      new StringSession(''),
      this.apiId,
      this.apiHash,
      {
        connectionRetries: 5,
      },
    );
    const state: LoginSessionState = { client, status: 'pending' };
    this.loginSessions.set(loginId, state);
    this.logger.debug(`Login ${loginId}: starting QR login flow`);

    // Fire and forget - the wizard polls getLoginStatus() for progress.
    this.runLogin(loginId, state).catch((err: unknown) => {
      state.status = 'error';
      state.error = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Login ${loginId}: failed - ${state.error}`,
        err instanceof Error ? err.stack : undefined,
      );
    });

    return loginId;
  }

  private async runLogin(
    loginId: string,
    state: LoginSessionState,
  ): Promise<void> {
    const { client } = state;
    await client.connect();

    await client.signInUserWithQrCode(
      { apiId: this.apiId, apiHash: this.apiHash },
      {
        qrCode: async (code) => {
          const loginUrl = `tg://login?token=${code.token.toString('base64url')}`;
          state.qrDataUrl = await QRCode.toDataURL(loginUrl);
        },
        password: async () => {
          state.status = 'need_password';
          return new Promise<string>((resolve) => {
            state.resolvePassword = resolve;
          });
        },
        onError: (err) => {
          // Surface it, but keep the retry loop going - most errors here
          // are just an expired QR token being refreshed automatically.
          state.error = String(err);
          this.logger.warn(`Login ${loginId}: recoverable QR error: ${err}`);
          return Promise.resolve(true);
        },
      },
    );

    const sessionString = client.session.save() as unknown as string;
    const me = await client.getMe();
    const account = await this.accounts.save(
      this.accounts.create({
        sessionString,
        displayName: me.username
          ? `@${me.username}`
          : `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || null,
      }),
    );

    this.clientPool.set(account.id, client);
    state.accountId = account.id;
    state.status = 'success';
    this.logger.log(`Login ${loginId}: authenticated as account ${account.id}`);
  }

  submitPassword(loginId: string, password: string): void {
    const state = this.loginSessions.get(loginId);
    if (!state) {
      this.logger.warn(`Password submitted for unknown login ${loginId}`);
      throw new NotFoundException('Unknown login session');
    }
    if (state.status !== 'need_password' || !state.resolvePassword) {
      throw new BadRequestException('This login is not waiting for a password');
    }
    this.logger.debug(`Login ${loginId}: password received`);
    state.resolvePassword(password);
  }

  getLoginStatus(loginId: string) {
    const state = this.loginSessions.get(loginId);
    if (!state) throw new NotFoundException('Unknown login session');
    return {
      status: state.status,
      qrDataUrl: state.status === 'pending' ? state.qrDataUrl : undefined,
      accountId: state.accountId,
      error: state.error,
    };
  }

  // ---------- Connected client pool (rebuildable from Postgres) ----------

  async getClientForAccount(accountId: string): Promise<TelegramClient> {
    const pooled = this.clientPool.get(accountId);
    if (pooled?.connected) return pooled;

    this.logger.debug(
      `Client pool miss for account ${accountId}, rebuilding from stored session`,
    );
    const account = await this.accounts.findOneBy({ id: accountId });
    if (!account) throw new NotFoundException('Unknown account');

    const client = new TelegramClient(
      new StringSession(account.sessionString),
      this.apiId,
      this.apiHash,
      { connectionRetries: 5 },
    );
    await client.connect();
    if (!(await client.isUserAuthorized())) {
      this.logger.warn(
        `Account ${accountId}: stored Telegram session is no longer valid`,
      );
      throw new BadRequestException(
        'Saved Telegram session is no longer valid - please log in again.',
      );
    }
    this.clientPool.set(accountId, client);
    return client;
  }

  // ---------- Dialog / channel listing ----------

  async listDialogs(accountId: string): Promise<DialogSummary[]> {
    this.logger.debug(`Listing dialogs for account ${accountId}`);
    const client = await this.getClientForAccount(accountId);
    const dialogs = await client.getDialogs({ limit: 200 });

    return dialogs
      .filter((d) => d.entity?.className === 'Channel')
      .map((d): DialogSummary => {
        const entity = d.entity as Api.Channel;
        return {
          id: entity.id.toString(),
          accessHash: entity.accessHash?.toString() ?? '',
          title: entity.title,
          kind: entity.megagroup ? 'group' : 'channel',
        };
      })
      .filter((c) => c.accessHash);
  }

  peerFor(channelId: string, accessHash: string): Api.InputPeerChannel {
    return new Api.InputPeerChannel({
      channelId: bigInt(channelId),
      accessHash: bigInt(accessHash),
    });
  }

  async listChannelVideos(
    accountId: string,
    channelId: string,
    accessHash: string,
  ): Promise<VideoSummary[]> {
    this.logger.debug(
      `Listing videos for channel ${channelId} (account ${accountId})`,
    );
    const client = await this.getClientForAccount(accountId);
    const peer = this.peerFor(channelId, accessHash);
    const videos: VideoSummary[] = [];

    for await (const msg of client.iterMessages(peer, {
      reverse: true,
      limit: MAX_MESSAGES_PER_CHANNEL,
    })) {
      const doc = this.videoDocumentFrom(msg.media);
      if (!doc) continue;
      const fileNameAttr = doc.attributes.find(
        (a): a is Api.DocumentAttributeFilename =>
          a instanceof Api.DocumentAttributeFilename,
      )?.fileName;
      videos.push({
        messageId: msg.id,
        title: msg.message || fileNameAttr || `Video ${msg.id}`,
      });
    }
    return videos;
  }

  async getVideoMessage(
    accountId: string,
    channelId: string,
    accessHash: string,
    msgId: number,
  ): Promise<{ client: TelegramClient; document: Api.Document }> {
    const client = await this.getClientForAccount(accountId);
    const peer = this.peerFor(channelId, accessHash);
    const [message] = await client.getMessages(peer, { ids: [msgId] });
    const document = this.videoDocumentFrom(message?.media);
    if (!document) {
      this.logger.warn(
        `Channel ${channelId} message ${msgId} has no playable video`,
      );
      throw new NotFoundException(`Message ${msgId} has no video`);
    }
    return { client, document };
  }

  // Narrows the loosely-typed media union down to a playable video
  // document, or undefined if this message isn't one.
  private videoDocumentFrom(
    media: Api.TypeMessageMedia | undefined,
  ): Api.Document | undefined {
    if (!(media instanceof Api.MessageMediaDocument)) return undefined;
    const doc = media.document;
    if (!(doc instanceof Api.Document) || !doc.mimeType?.startsWith('video/'))
      return undefined;
    return doc;
  }
}
