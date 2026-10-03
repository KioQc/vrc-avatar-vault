import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import worker, { cleanup } from './worker.mjs';

// Execute the exact production SQL against SQLite, adapting only the D1 transport shape.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./migrations/0001_stats.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) {
          params = values;
          return statement;
        },
        run() {
          const result = sqlite.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(result.changes) }, results: [] };
        },
        first() {
          return sqlite.prepare(sql).get(...params) || null;
        },
        all() {
          return { success: true, results: sqlite.prepare(sql).all(...params) };
        },
        sql,
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map((s) => (/^SELECT/i.test(s.sql) ? s.all() : s.run()));
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const env = {
    DB,
    ORIGIN: 'https://vav.example',
    OWNER_SECRET: randomBytes(32).toString('hex'),
    ASSETS: { fetch: () => new Response('<h1>Owner</h1>') },
    LOGIN_LIMIT: { limit: async () => ({ success: true }) },
    OWNER_LIMIT: { limit: async () => ({ success: true }) },
    INGEST_LIMIT: { limit: async () => ({ success: true }) },
  };
  const call = (path, { body, headers, ...options } = {}) =>
    worker.fetch(
      new Request(`${env.ORIGIN}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  const login = async () => {
    const r = await call('/owner/login', {
      method: 'POST',
      headers: { Origin: env.ORIGIN },
      body: { secret: env.OWNER_SECRET },
    });
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /Secure; HttpOnly; SameSite=Strict/);
    return cookie.split(';')[0];
  };
  return { env, call, login, close: () => sqlite.close() };
}
const report = () => ({
  schema: 1,
  session: randomUUID(),
  day: Math.floor(Date.now() / 86400000),
  version: '0.8.4-preview.1',
  metrics: [{ operation: 'avatar', outcome: 'ok', count: 5, milliseconds: 1000 }],
});
test('Cloudflare: owner authentication, cookie, revocation and secret rotation', async () => {
  const f = fixture();
  try {
    assert.equal((await f.call('/health')).status, 200);
    assert.equal((await f.call('/owner/stats')).status, 401);
    assert.equal(
      (await f.call('/owner/login', { method: 'POST', body: { secret: f.env.OWNER_SECRET } }))
        .status,
      403,
    );
    const cookie = await f.login();
    assert.equal((await f.call('/owner/stats', { headers: { Cookie: cookie } })).status, 200);
    assert.equal(
      (
        await f.call('/owner/logout', {
          method: 'POST',
          headers: { Cookie: cookie, Origin: f.env.ORIGIN },
        })
      ).status,
      200,
    );
    assert.equal((await f.call('/owner/stats', { headers: { Cookie: cookie } })).status, 401);
    const next = await f.login();
    f.env.OWNER_SECRET = randomBytes(32).toString('hex');
    assert.equal((await f.call('/owner/stats', { headers: { Cookie: next } })).status, 401);
  } finally {
    f.close();
  }
});
test('Cloudflare: real SQL snapshots deduplicate, retain newer counters and withdraw atomically', async () => {
  const f = fixture();
  try {
    const cookie = await f.login();
    const headers = { Authorization: `Bearer ${randomBytes(32).toString('hex')}` };
    const data = report();
    for (let n = 0; n < 2; n++)
      assert.equal(
        (await f.call('/v1/report', { method: 'POST', headers, body: data })).status,
        202,
      );
    const stats = async () =>
      (await f.call('/owner/stats', { headers: { Cookie: cookie } })).json();
    assert.equal((await stats()).metrics[0].count, 5);
    const stale = { ...data, metrics: [{ ...data.metrics[0], count: 2, milliseconds: 100 }] };
    assert.equal(
      (await f.call('/v1/report', { method: 'POST', headers, body: stale })).status,
      202,
    );
    assert.equal((await stats()).metrics[0].count, 5);
    assert.equal((await stats()).totals.installations, 1);
    assert.equal((await f.call('/v1/participation', { method: 'DELETE', headers })).status, 200);
    assert.equal((await stats()).totals.installations, 0);
    assert.equal((await f.call('/v1/report', { method: 'POST', headers, body: data })).status, 410);
    assert.equal((await stats()).metrics.length, 0);
  } finally {
    f.close();
  }
});
test('Cloudflare: rejects personal fields, oversized payload, foreign Origin, dates and rate limits', async () => {
  const f = fixture();
  try {
    const headers = { Authorization: `Bearer ${randomBytes(32).toString('hex')}` };
    assert.equal(
      (
        await f.call('/v1/report', {
          method: 'POST',
          headers,
          body: { ...report(), email: 'private@example.com' },
        })
      ).status,
      400,
    );
    assert.equal(
      (await f.call('/v1/report', { method: 'POST', headers, body: { ...report(), day: 1 } }))
        .status,
      400,
    );
    assert.equal(
      (
        await f.call('/v1/report', {
          method: 'POST',
          headers: { ...headers, Origin: f.env.ORIGIN },
          body: report(),
        })
      ).status,
      403,
    );
    assert.equal(
      (await f.call('/v1/report', { method: 'POST', headers, body: { data: 'x'.repeat(17000) } }))
        .status,
      400,
    );
    f.env.INGEST_LIMIT.limit = async () => ({ success: false });
    assert.equal(
      (await f.call('/v1/report', { method: 'POST', headers, body: report() })).status,
      429,
    );
    assert.equal(
      (await worker.fetch(new Request('https://other.example/health'), f.env)).status,
      403,
    );
  } finally {
    f.close();
  }
});
test('Cloudflare: scheduled cleanup removes expired metrics and sessions; D1 failures stay private', async () => {
  const f = fixture();
  try {
    const cookie = await f.login();
    await f.call('/v1/report', {
      method: 'POST',
      headers: { Authorization: `Bearer ${randomBytes(32).toString('hex')}` },
      body: report(),
    });
    await cleanup(f.env, Date.now() + 92 * 86400000);
    assert.equal((await f.call('/owner/stats', { headers: { Cookie: cookie } })).status, 401);
    const next = await f.login();
    assert.equal(
      (await (await f.call('/owner/stats', { headers: { Cookie: next } })).json()).totals
        .installations,
      0,
    );
    f.env.DB.prepare = () => {
      throw new Error('SECRET SQL PRIVATE DATA');
    };
    const fail = await f.call('/health');
    assert.equal(fail.status, 503);
    assert.ok(!(await fail.text()).includes('SECRET'));
  } finally {
    f.close();
  }
});
