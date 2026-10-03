import { timingSafeEqual } from 'node:crypto';
import { validate } from './schema.mjs';

const encode = new TextEncoder();
const digest = (s) => crypto.subtle.digest('SHA-256', encode.encode(s));
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const hash = async (s) => hex(await digest(s));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const DAY = 86400000;
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const json = (code, data, extra = {}) =>
  Response.json(data, { status: code, headers: { ...headers, ...extra } });
async function read(request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    throw new Error('body');
  if (Number(request.headers.get('content-length') || 0) > 16384) throw new Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16384) {
        await reader.cancel();
        throw new Error('body');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export const REPORT_SQL = `INSERT INTO reports(installation,session,day,version,metrics,total,last_seen)
 SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE NOT EXISTS(SELECT 1 FROM withdrawn WHERE installation=?1 AND expires>?7)
 ON CONFLICT(installation,session,day) DO UPDATE SET
 metrics=CASE WHEN excluded.total>=reports.total THEN excluded.metrics ELSE reports.metrics END,
 total=MAX(reports.total,excluded.total),last_seen=MAX(reports.last_seen,excluded.last_seen)
 WHERE reports.version=excluded.version`;
export async function cleanup(env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reports WHERE day<?').bind(Math.floor(now / DAY) - 90),
    env.DB.prepare('DELETE FROM withdrawn WHERE expires<?').bind(now),
    env.DB.prepare('DELETE FROM owner_sessions WHERE expires<?').bind(now),
  ]);
}
async function stats(env, now) {
  const day = Math.floor(now / DAY) - 30,
    since = now - 30 * DAY;
  const results = await env.DB.batch([
    env.DB.prepare(
      'SELECT COUNT(DISTINCT installation) installations,COUNT(DISTINCT installation||session) sessions FROM reports WHERE day>=? AND last_seen>=?',
    ).bind(day, since),
    env.DB.prepare(
      'SELECT COUNT(DISTINCT installation) count FROM reports WHERE day>=? AND last_seen>=?',
    ).bind(day, now - DAY),
    env.DB.prepare(
      "SELECT date(day*86400,'unixepoch') day,COUNT(DISTINCT installation) installations,COUNT(DISTINCT installation||session) sessions FROM reports WHERE day>=? AND last_seen>=? GROUP BY day ORDER BY day",
    ).bind(day, since),
    env.DB.prepare(
      'SELECT version,COUNT(DISTINCT installation) installations FROM reports WHERE day>=? AND last_seen>=? GROUP BY version ORDER BY installations DESC',
    ).bind(day, since),
    env.DB.prepare(
      "SELECT json_extract(j.value,'$.operation') operation,json_extract(j.value,'$.outcome') outcome,SUM(json_extract(j.value,'$.count')) count,SUM(json_extract(j.value,'$.milliseconds')) milliseconds FROM reports r,json_each(r.metrics) j WHERE r.day>=? AND r.last_seen>=? GROUP BY operation,outcome",
    ).bind(day, since),
  ]);
  return {
    totals: { ...results[0].results[0], active: results[1].results[0].count },
    daily: results[2].results,
    versions: results[3].results,
    metrics: results[4].results,
    updatedAt: new Date(now).toISOString(),
    retentionDays: 90,
  };
}
export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url),
    path = url.pathname;
  if (url.origin !== env.ORIGIN) return json(403, { error: 'Invalid origin' });
  if (path === '/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT 1 FROM reports LIMIT 1').first();
    return json(200, { ok: true });
  }
  if (request.method === 'GET' && ['/', '/dashboard.js', '/style.css'].includes(path)) {
    const result = await env.ASSETS.fetch(request);
    const secured = new Headers(result.headers);
    for (const [name, value] of Object.entries(headers)) secured.set(name, value);
    return new Response(result.body, {
      status: result.status,
      headers: secured,
    });
  }
  if (!env.OWNER_SECRET || env.OWNER_SECRET.length < 40)
    return json(503, { error: 'Owner access is not configured' });
  const sameOrigin = request.headers.get('origin') === env.ORIGIN;
  if (path === '/owner/login' && request.method === 'POST') {
    if (!sameOrigin) return json(403, { error: 'Origin refused' });
    const ipKey = await hash(request.headers.get('cf-connecting-ip') || 'unknown');
    if (!(await env.LOGIN_LIMIT.limit({ key: ipKey })).success)
      return json(429, { error: 'Trop de tentatives. Réessaie dans une minute.' });
    const body = await read(request);
    if (
      !body ||
      Object.keys(body).join() !== 'secret' ||
      typeof body.secret !== 'string' ||
      !timingSafeEqual(
        new Uint8Array(await digest(body.secret)),
        new Uint8Array(await digest(env.OWNER_SECRET)),
      )
    )
      return json(401, { error: 'Clé incorrecte.' });
    const token = random();
    await env.DB.prepare('INSERT INTO owner_sessions(token,expires,key_hash) VALUES(?,?,?)')
      .bind(await hash(token), now + 3600000, await hash(env.OWNER_SECRET))
      .run();
    return json(
      200,
      { ok: true },
      {
        'Set-Cookie': `vav_owner=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
      },
    );
  }
  if (path.startsWith('/owner/')) {
    const cookie = /(?:^|; )vav_owner=([a-f0-9]{64})(?:;|$)/.exec(
      request.headers.get('cookie') || '',
    )?.[1];
    if (!cookie) return json(401, { error: 'Connexion propriétaire requise.' });
    const token = await hash(cookie);
    const session = await env.DB.prepare(
      'SELECT 1 FROM owner_sessions WHERE token=? AND expires>? AND key_hash=?',
    )
      .bind(token, now, await hash(env.OWNER_SECRET))
      .first();
    if (!session) return json(401, { error: 'Connexion propriétaire requise.' });
    if (path === '/owner/logout' && request.method === 'POST') {
      if (!sameOrigin) return json(403, { error: 'Origin refused' });
      await env.DB.prepare('DELETE FROM owner_sessions WHERE token=?').bind(token).run();
      return json(
        200,
        { ok: true },
        { 'Set-Cookie': 'vav_owner=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' },
      );
    }
    if (path === '/owner/stats' && request.method === 'GET') {
      if (!(await env.OWNER_LIMIT.limit({ key: token })).success)
        return json(429, { error: 'Attends quelques secondes avant d’actualiser.' });
      return json(200, await stats(env, now));
    }
    return json(404, { error: 'Not found' });
  }
  if (path === '/v1/report' || path === '/v1/participation') {
    if (request.headers.has('origin')) return json(403, { error: 'Desktop only' });
    const credential = /^Bearer ([a-f0-9]{64})$/.exec(
      request.headers.get('authorization') || '',
    )?.[1];
    if (!credential) return json(401, { error: 'Installation credential required' });
    const installation = await hash(credential);
    if (!(await env.INGEST_LIMIT.limit({ key: installation })).success)
      return json(429, { error: 'Rate limited' });
    if (path === '/v1/participation' && request.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO withdrawn VALUES(?,?) ON CONFLICT(installation) DO UPDATE SET expires=excluded.expires',
        ).bind(installation, now + 90 * DAY),
        env.DB.prepare('DELETE FROM reports WHERE installation=?').bind(installation),
      ]);
      return json(200, { deleted: true });
    }
    if (path === '/v1/report' && request.method === 'POST') {
      const body = await read(request),
        today = Math.floor(now / DAY);
      if (!validate(body) || body.day < today - 1 || body.day > today)
        return json(400, { error: 'Invalid aggregate report' });
      const total = body.metrics.reduce((n, m) => n + m.count, 0);
      const result = await env.DB.prepare(REPORT_SQL)
        .bind(
          installation,
          body.session,
          body.day,
          body.version,
          JSON.stringify(body.metrics),
          total,
          now,
        )
        .run();
      if (!result.meta.changes)
        return json(410, { error: 'Participation deleted or session rejected' });
      return json(202, { accepted: true });
    }
  }
  return json(404, { error: 'Not found' });
}
export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      return json(e.message === 'body' || e instanceof SyntaxError ? 400 : 503, {
        error: 'Collecteur indisponible ou requête invalide. Aucun détail privé exposé.',
      });
    }
  },
  async scheduled(_event, env) {
    await cleanup(env);
  },
};
