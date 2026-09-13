import { TelegramClient } from 'telegram';

export type LoginStatus = 'pending' | 'need_password' | 'success' | 'error';

// In-memory state for one in-progress QR login attempt, keyed by loginId
// in TelegramService. Lives only as long as the login flow does - once it
// succeeds the durable bits move into AccountEntity.
export interface LoginSessionState {
  client: TelegramClient;
  status: LoginStatus;
  qrDataUrl?: string;
  accountId?: string;
  error?: string;
  resolvePassword?: (password: string) => void;
}
