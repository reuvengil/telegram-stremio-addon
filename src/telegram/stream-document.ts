import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Api, TelegramClient } from 'telegram';
import bigInt from 'big-integer';

// Telegram's iterDownload only accepts offsets aligned to the chunk size it
// negotiates. So to serve an arbitrary byte range (what Stremio asks for
// when seeking) we round the start down to the nearest chunk boundary,
// fetch from there, and trim the extra leading bytes off the first chunk.
const CHUNK_SIZE = 512 * 1024; // 512KB, must be a multiple of 4KB

const logger = new Logger('StreamDocument');

export async function streamDocumentToResponse(
  client: TelegramClient,
  doc: Api.Document,
  req: Request,
  res: Response,
): Promise<void> {
  const fileSize = Number(doc.size);
  const range = req.headers.range;
  let start = 0;
  let end = fileSize - 1;

  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      start = parseInt(match[1], 10);
      end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
    }
  }

  logger.debug(
    `${doc.mimeType} size=${fileSize} range=${range ?? 'none'} -> bytes ${start}-${end}`,
  );

  res.writeHead(range ? 206 : 200, {
    'Content-Type': doc.mimeType || 'video/mp4',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    ...(range && { 'Content-Range': `bytes ${start}-${end}/${fileSize}` }),
  });

  const alignedStart = Math.floor(start / CHUNK_SIZE) * CHUNK_SIZE;
  const leadingTrim = start - alignedStart;
  let bytesSent = 0;
  const bytesWanted = end - start + 1;

  const fileLocation = new Api.InputDocumentFileLocation({
    id: doc.id,
    accessHash: doc.accessHash,
    fileReference: doc.fileReference,
    thumbSize: '',
  });

  try {
    const iter = client.iterDownload({
      file: fileLocation,
      offset: bigInt(alignedStart),
      requestSize: CHUNK_SIZE,
      fileSize: bigInt(fileSize),
    });

    let firstChunk = true;
    for await (let chunk of iter) {
      if (firstChunk && leadingTrim > 0) {
        chunk = chunk.subarray(leadingTrim);
        firstChunk = false;
      }
      if (bytesSent + chunk.length > bytesWanted) {
        chunk = chunk.subarray(0, bytesWanted - bytesSent);
      }
      bytesSent += chunk.length;
      res.write(chunk);
      if (bytesSent >= bytesWanted) break;
    }
    res.end();
  } catch (err) {
    logger.error(
      `Stream error for document ${doc.id.toString()}`,
      err instanceof Error ? err.stack : String(err),
    );
    res.end();
  }
}
