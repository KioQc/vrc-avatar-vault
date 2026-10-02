import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';

export function webhookUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid Discord webhook address');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'discord.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)
  )
    throw new Error('Use an HTTPS discord.com webhook for a text channel');
  return url;
}
export function payload(content) {
  if (!content.trim() || content.length > 2000)
    throw new Error('Message must contain 1–2000 characters');
  return { content, allowed_mentions: { parse: [] } };
}
async function request(url, options) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await globalThis.fetch(url, {
        ...options,
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(
        'Discord request failed. Check the channel before retrying; credentials were not logged.',
      );
    }
    if (response.status === 429) {
      const info = await response.json().catch(() => ({}));
      const seconds = Number(info.retry_after);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30 || attempt === 2)
        throw new Error('Discord rate limit: try later');
      await setTimeout(Math.ceil(seconds * 1000) + 100);
      continue;
    }
    if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`);
    return response.json();
  }
}
export async function post({ webhook, content, receipt, send = false }) {
  const url = webhookUrl(webhook);
  const body = payload(content);
  const destination = createHash('sha256')
    .update(url.pathname.split('/').slice(0, 4).join('/'))
    .digest('hex');
  const hash = createHash('sha256').update(content).digest('hex');
  if (!send) return { preview: body, characters: content.length };
  mkdirSync(dirname(receipt), { recursive: true });
  if (existsSync(receipt)) {
    const previous = JSON.parse(readFileSync(receipt, 'utf8'));
    if (previous.destination !== destination)
      throw new Error('Receipt belongs to a different channel');
    if (previous.status !== 'sent')
      throw new Error(
        'Previous delivery is uncertain. Check the channel before removing its pending receipt.',
      );
    if (previous.hash === hash) return { skipped: true, messageId: previous.messageId };
    throw new Error(
      'This announcement already exists with different content. Edit it in Discord instead of posting a duplicate.',
    );
  }
  // Keep an uncertain receipt on network failure: automatic retry could create a duplicate.
  writeFileSync(receipt, JSON.stringify({ status: 'pending', destination, hash }), {
    flag: 'wx',
    mode: 0o600,
  });
  url.searchParams.set('wait', 'true');
  const message = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!message?.id) throw new Error('No delivery confirmation received; check the channel');
  writeFileSync(
    receipt,
    JSON.stringify(
      { status: 'sent', destination, hash, messageId: message.id, channelId: message.channel_id },
      null,
      2,
    ),
  );
  const check = webhookUrl(webhook);
  check.pathname += `/messages/${message.id}`;
  const saved = await request(check, { method: 'GET' });
  if (saved.content !== content)
    throw new Error('Message was sent but its content could not be verified');
  return { sent: true, verified: true, messageId: message.id, channelId: message.channel_id };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [channel, messageFile, receiptFile] = process.argv.slice(2).filter((x) => x !== '--send');
  try {
    if (!channel || !messageFile || !receiptFile)
      throw new Error(
        'Usage: node scripts/discord-post.mjs CHANNEL MESSAGE.md RECEIPT.json [--send]',
      );
    const content = readFileSync(messageFile, 'utf8').trim();
    const send = process.argv.includes('--send');
    if (!send) console.log(JSON.stringify({ channel, ...payload(content) }, null, 2));
    else {
      if (!process.env.VAV_DISCORD_WEBHOOKS_FILE)
        throw new Error(
          'Set VAV_DISCORD_WEBHOOKS_FILE to the private configuration file outside the repository',
        );
      const hooks = JSON.parse(readFileSync(process.env.VAV_DISCORD_WEBHOOKS_FILE, 'utf8'));
      console.log(
        JSON.stringify(
          await post({ webhook: hooks[channel], content, receipt: receiptFile, send }),
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
