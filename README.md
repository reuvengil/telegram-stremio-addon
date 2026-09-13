# Telegram → Stremio addon (NestJS + Docker + Postgres)

Exposes Telegram channels as Stremio series, streamed directly from
Telegram on demand. A single-page web wizard handles QR login and channel
selection per person; everything needed to reconnect later lives in
Postgres, so a crash or redeploy doesn't lose anyone's setup.

## Run it

```bash
cp .env.example .env
# fill in TELEGRAM_API_ID / TELEGRAM_API_HASH from https://my.telegram.org
docker compose up --build
```

Then open **http://localhost:3000/configure** and:
1. Scan the QR code with Telegram (Settings → Devices → Link Desktop
   Device), enter your 2FA password if you have one.
2. Search/select the channels or groups you want exposed.
3. Copy the manifest link it shows you, or click "Open in Stremio".

Anyone else you trust can do the same at the same URL — each run of the
wizard creates its own account row and its own dedicated manifest link;
nobody's session or channel list overwrites anyone else's.

## Architecture

- **NestJS** app, TypeScript throughout, compiled to CommonJS (Nest's
  decorator-based DI is idiomatically CommonJS; ESM output would add real
  friction here for no practical benefit - the source code itself is
  modern `import`/`export`, no `require()`).
- **One long-running Node process**, not serverless. This matters: it's
  what lets the QR login flow just hold a live GramJS client in server
  memory for the duration of one login attempt, instead of needing to
  reconstruct a connection on every poll.
- **Postgres** holds the two things that actually need to survive a
  restart: `accounts` (the durable Telegram session string per login) and
  `channels` (which channels each account chose to expose). If the
  container crashes, every account can be reconnected from its row alone
  — see `TelegramService.getClientForAccount`.
- **`public/wizard.html`** — one static file, vanilla JS, no build step of
  its own. Talks to a small JSON API under `/api/...`.

## Key files

- `src/telegram/telegram.service.ts` — QR login state machine, the
  connected-client pool (rebuilt from Postgres on demand), dialog listing,
  message listing.
- `src/wizard/wizard.controller.ts` — the API behind the wizard: start
  login, poll status, submit 2FA password, list dialogs, save chosen
  channels.
- `src/stremio/stremio.controller.ts` — the actual Stremio protocol,
  namespaced by account: `/:accountId/manifest.json`,
  `/catalog/...`, `/meta/...`, `/stream/...`, and `/raw/:seriesId/:msgId`
  which does the real Range-based proxy to Telegram.
- `src/telegram/stream-document.ts` — the Range-request-to-Telegram-chunk
  logic (unchanged from the original POC): round the requested byte range
  down to Telegram's chunk boundary, fetch from there, trim the excess off
  the first chunk.

## Notes and known limitations

- **No auth on the wizard itself.** An account is identified by an
  unguessable UUID in the URL, with nothing else protecting it. Fine for
  "just me and people I trust" running this on infrastructure you control;
  not something to expose as a public service as-is.
- **`synchronize: true`** on the TypeORM connection means the schema
  auto-creates itself on first boot - convenient here, but swap it for
  real migrations if this ever needs to survive schema changes without
  risking data loss.
- **Format compatibility isn't handled.** Most Telegram video is already
  H.264/AAC MP4, which Stremio plays natively. A file that isn't would
  need an on-the-fly transcode (e.g. piping through `ffmpeg`) - not
  implemented here.
- **Episode numbering** is purely message-post-order (`MAX_MESSAGES_PER_CHANNEL`
  in `telegram.service.ts` caps how far back it scans, 500 by default).
  Parsing "Episode 12"-style captions for numbering would be a nicer touch.
- Not yet tested end-to-end against a live Postgres in the environment
  this was written in (sandboxed, no outbound DB access) - the TypeScript
  compiles cleanly and Nest's dependency injection wires up correctly, but
  give the full `docker compose up` flow a real run before trusting it.
