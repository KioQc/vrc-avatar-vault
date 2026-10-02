import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { payload, webhookUrl, post } from '../discord-post.mjs';

test('rejects lookalike endpoints and prevents all automatic mentions', () => {
  for (const url of [
    'http://discord.com/api/webhooks/123/test',
    'https://discord.com.evil.test/api/webhooks/123/test',
    'https://discord.com/api/webhooks/123/test?x=1',
  ]) {
    assert.throws(() => webhookUrl(url));
  }
  assert.deepEqual(payload('@everyone <@123>').allowed_mentions, { parse: [] });
  assert.throws(() => payload(' '));
  assert.throws(() => payload('a'.repeat(2001)));
});

test('verified delivery is deduplicated and receipts contain no credential', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'vav-discord-'));
  const receipt = join(folder, 'receipt.json');
  const fetchBefore = globalThis.fetch;
  const content = 'Release test';
  const webhook = 'https://discord.com/api/webhooks/123/fake_private_token';
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    if (options.method === 'POST')
      assert.deepEqual(JSON.parse(options.body).allowed_mentions, { parse: [] });
    return { ok: true, status: 200, json: async () => ({ id: '456', channel_id: '789', content }) };
  };
  try {
    assert.equal((await post({ webhook, content, receipt, send: true })).verified, true);
    assert.equal((await post({ webhook, content, receipt, send: true })).skipped, true);
    assert.equal(calls, 2);
    assert.equal(readFileSync(receipt, 'utf8').includes('fake_private_token'), false);
    await assert.rejects(
      post({ webhook, content: 'changed', receipt, send: true }),
      /already exists/,
    );
  } finally {
    globalThis.fetch = fetchBefore;
    rmSync(folder, { recursive: true });
  }
});

test('uncertain network delivery blocks automatic duplicate sends', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'vav-discord-'));
  const fetchBefore = globalThis.fetch;
  const args = {
    webhook: 'https://discord.com/api/webhooks/123/fake',
    content: 'Test',
    receipt: join(folder, 'receipt.json'),
    send: true,
  };
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('private network details');
  };
  try {
    await assert.rejects(post(args), /Discord request failed/);
    await assert.rejects(post(args), /uncertain/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = fetchBefore;
    rmSync(folder, { recursive: true });
  }
});
