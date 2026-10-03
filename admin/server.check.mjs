import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVaultServer, validate, clientAddress } from './server.mjs';
import { checkDeployment } from './check-deployment.mjs';

test('proxy addresses are trusted only from an explicitly enabled local proxy', () => {
  const headers = { 'x-vav-client-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.8' };
  assert.equal(clientAddress('127.0.0.1', headers), '127.0.0.1');
  assert.equal(clientAddress('192.0.2.1', headers, true), '192.0.2.1');
  assert.equal(clientAddress('127.0.0.1', headers, true), '203.0.113.7');
  assert.equal(
    clientAddress('::1', { 'x-vav-client-ip': '203.0.113.7, 198.51.100.8' }, true),
    '::1',
  );
  assert.equal(clientAddress('::1', { 'x-forwarded-for': '198.51.100.8' }, true), '::1');
});
test('deployment checks require HTTPS and refuse a publicly readable owner endpoint', async () => {
  const headers = {
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Cache-Control': 'no-store',
    'Strict-Transport-Security': 'max-age=31536000',
  };
  const fake = async (url) =>
    new Response(url.endsWith('/health') ? '{"ok":true}' : '{}', {
      status: url.endsWith('/owner/stats') ? 401 : 200,
      headers,
    });
  assert.equal((await checkDeployment('https://stats.example.com', fake)).ok, true);
  await assert.rejects(checkDeployment('http://stats.example.com', fake));
  await assert.rejects(checkDeployment('https://user:pass@stats.example.com', fake));
  await assert.rejects(
    checkDeployment(
      'https://stats.example.com',
      async () => new Response('{"ok":true}', { status: 200, headers }),
    ),
    /expected HTTP 401/,
  );
});

const origin = 'http://127.0.0.1:14830';
async function fixture(options = {}) {
  const secret = randomBytes(32).toString('hex');
  const server = createVaultServer({ secret, ...options });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const call = (path, { method = 'GET', body, headers = {} } = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path,
          method,
          headers: { Host: '127.0.0.1:14830', 'Content-Type': 'application/json', ...headers },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            let json;
            try {
              json = JSON.parse(text);
            } catch {
              /* HTML response */
            }
            resolve({ status: res.statusCode, headers: res.headers, json, text });
          });
        },
      );
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  const login = async () => {
    const r = await call('/owner/login', {
      method: 'POST',
      headers: { Origin: origin },
      body: { secret },
    });
    assert.equal(r.status, 200);
    assert.match(r.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
    return r.headers['set-cookie'][0].split(';')[0];
  };
  return { call, login, close: () => new Promise((r) => server.close(r)) };
}
function report(day = Math.floor(Date.now() / 86400000)) {
  return {
    schema: 1,
    session: randomUUID(),
    day,
    version: '0.8.3',
    metrics: [
      { operation: 'avatar', outcome: 'ok', count: 10, milliseconds: 3000 },
      { operation: 'avatar', outcome: 'rate_limit', count: 2, milliseconds: 100 },
    ],
  };
}
test('owner access rejects anonymous, wrong secret, cross-origin and DNS rebinding; logout revokes cookie', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/owner/stats')).status, 401);
    assert.equal(
      (await f.call('/owner/login', { method: 'POST', body: { secret: 'wrong' } })).status,
      403,
    );
    assert.equal(
      (
        await f.call('/owner/login', {
          method: 'POST',
          headers: { Origin: origin },
          body: { secret: 'wrong' },
        })
      ).status,
      401,
    );
    assert.equal((await f.call('/health', { headers: { Host: 'evil.example' } })).status, 403);
    const cookie = await f.login();
    assert.equal(
      (await f.call('/owner/stats', { headers: { Cookie: cookie } })).json.totals.installations,
      0,
    );
    assert.equal(
      (await f.call('/owner/logout', { method: 'POST', headers: { Cookie: cookie } })).status,
      403,
    );
    assert.equal(
      (
        await f.call('/owner/logout', {
          method: 'POST',
          headers: { Cookie: cookie, Origin: origin },
        })
      ).status,
      200,
    );
    assert.equal((await f.call('/owner/stats', { headers: { Cookie: cookie } })).status, 401);
  } finally {
    await f.close();
  }
});
test('real HTTP aggregates deduplicate retries, isolate installations and remove all withdrawn data', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login();
    const headers = { Authorization: `Bearer ${randomBytes(32).toString('hex')}` };
    const data = report();
    assert.equal((await f.call('/v1/report', { method: 'POST', headers, body: data })).status, 202);
    assert.equal((await f.call('/v1/report', { method: 'POST', headers, body: data })).status, 202);
    let stats = (await f.call('/owner/stats', { headers: { Cookie: cookie } })).json;
    assert.equal(stats.totals.installations, 1);
    assert.equal(stats.totals.sessions, 1);
    assert.equal(
      stats.metrics.reduce((n, m) => n + m.count, 0),
      12,
    );
    assert.ok(!JSON.stringify(stats).includes(data.session));
    assert.equal(
      (
        await f.call('/v1/report', {
          method: 'POST',
          headers,
          body: { ...data, username: 'must-not-store' },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.call('/v1/report', {
          method: 'POST',
          headers: { ...headers, Origin: 'https://evil.example' },
          body: data,
        })
      ).status,
      403,
    );
    const second = { Authorization: `Bearer ${randomBytes(32).toString('hex')}` };
    await f.call('/v1/report', { method: 'POST', headers: second, body: report() });
    assert.equal((await f.call('/v1/participation', { method: 'DELETE', headers })).status, 200);
    stats = (await f.call('/owner/stats', { headers: { Cookie: cookie } })).json;
    assert.equal(stats.totals.installations, 1);
    assert.equal(
      stats.metrics.reduce((n, m) => n + m.count, 0),
      12,
    );
    assert.equal((await f.call('/v1/report', { method: 'POST', headers, body: data })).status, 410);
  } finally {
    await f.close();
  }
});
test('daily reports avoid midnight duplication; data expires after 90 days and owner session after one hour', async () => {
  let now = Date.now();
  const f = await fixture({ clock: () => now });
  try {
    const cookie = await f.login();
    const headers = { Authorization: `Bearer ${randomBytes(32).toString('hex')}` };
    const data = report(Math.floor(now / 86400000));
    await f.call('/v1/report', { method: 'POST', headers, body: data });
    now += 86400000;
    await f.call('/v1/report', { method: 'POST', headers, body: data });
    assert.equal((await f.call('/owner/stats', { headers: { Cookie: cookie } })).status, 401);
    const nextCookie = await f.login();
    const stats = (await f.call('/owner/stats', { headers: { Cookie: nextCookie } })).json;
    assert.equal(stats.daily.length, 1);
    assert.equal(
      stats.metrics.reduce((n, m) => n + m.count, 0),
      12,
    );
    now += 91 * 86400000;
    const finalCookie = await f.login();
    assert.equal(
      (await f.call('/owner/stats', { headers: { Cookie: finalCookie } })).json.totals
        .installations,
      0,
    );
    assert.equal((await f.call('/v1/report', { method: 'POST', headers, body: data })).status, 400);
  } finally {
    await f.close();
  }
});
test('database survives restart but authenticated sessions do not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vav-admin-test-'));
  let f = await fixture({ database: join(dir, 'stats.sqlite') });
  try {
    const cookie = await f.login();
    await f.call('/v1/report', {
      method: 'POST',
      headers: { Authorization: `Bearer ${randomBytes(32).toString('hex')}` },
      body: report(),
    });
    await f.close();
    f = await fixture({ database: join(dir, 'stats.sqlite') });
    assert.equal((await f.call('/owner/stats', { headers: { Cookie: cookie } })).status, 401);
    const next = await f.login();
    assert.equal(
      (await f.call('/owner/stats', { headers: { Cookie: next } })).json.totals.installations,
      1,
    );
  } finally {
    await f.close();
    rmSync(dir, { recursive: true });
  }
});
test('strict payload rejects arbitrary strings, duplicate buckets, oversized values and unknown data', () => {
  assert.ok(validate(report()));
  assert.ok(
    !validate({
      ...report(),
      metrics: [{ ...report().metrics[0], operation: 'https://private-avatar' }],
    }),
  );
  assert.ok(!validate({ ...report(), metrics: [report().metrics[0], report().metrics[0]] }));
  assert.ok(!validate({ ...report(), metrics: [{ ...report().metrics[0], count: -1 }] }));
  assert.ok(!validate({ ...report(), version: '<script>alert(1)</script>' }));
  assert.ok(
    !validate({ ...report(), metrics: [{ ...report().metrics[0], milliseconds: 999999999 }] }),
  );
});
