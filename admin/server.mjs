import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

export function clientAddress(remote, headers, trustLocalProxy = false) {
  const direct = remote || 'unknown';
  if (!trustLocalProxy || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(direct)) return direct;
  const forwarded = headers['x-vav-client-ip'];
  // This header must be overwritten by the local proxy, never appended or passed through.
  return typeof forwarded === 'string' && isIP(forwarded) ? forwarded : direct;
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
import { validate, exact } from './report-schema.mjs';
export { validate } from './report-schema.mjs';
export function createVaultServer({
  database = ':memory:',
  secret,
  origin = 'http://127.0.0.1:14830',
  clock = Date.now,
  trustLocalProxy = false,
} = {}) {
  if (typeof secret !== 'string' || secret.length < 40)
    throw new Error('Owner secret must contain at least 40 characters');
  const publicUrl = new URL(origin);
  if (
    publicUrl.origin !== origin ||
    (publicUrl.protocol !== 'https:' &&
      !['http://127.0.0.1:14830', 'http://localhost:14830'].includes(origin))
  )
    throw new Error('Use HTTPS or the local preview origin');
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sessions(installation TEXT NOT NULL, session TEXT NOT NULL, day TEXT NOT NULL, version TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(installation,session,day));
    CREATE TABLE IF NOT EXISTS metrics(installation TEXT NOT NULL,session TEXT NOT NULL,day TEXT NOT NULL,operation TEXT NOT NULL,outcome TEXT NOT NULL,count INTEGER NOT NULL,milliseconds INTEGER NOT NULL,PRIMARY KEY(installation,session,day,operation,outcome), FOREIGN KEY(installation,session,day) REFERENCES sessions ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS sessions_seen ON sessions(last_seen);
    CREATE TABLE IF NOT EXISTS deleted(installation TEXT PRIMARY KEY,expires INTEGER NOT NULL);`);
  const logins = new Map();
  const limits = new Map();
  const purge = () => {
    db.prepare('DELETE FROM sessions WHERE last_seen < ?').run(clock() - 90 * 86400000);
    db.prepare('DELETE FROM deleted WHERE expires < ?').run(clock());
    for (const [key, value] of limits) if (value.until <= clock()) limits.delete(key);
    for (const [key, expiry] of logins) if (expiry <= clock()) logins.delete(key);
  };
  const cleanup = setInterval(purge, 3600000);
  cleanup.unref();
  purge();
  function limit(key, maximum, window = 60000) {
    let item = limits.get(key);
    if (!item || item.until <= clock()) {
      if (!item && limits.size >= 20000) {
        purge();
        if (limits.size >= 20000) return false;
      }
      item = { count: 0, until: clock() + window };
      limits.set(key, item);
    }
    return ++item.count <= maximum;
  }
  const html = readFileSync(new URL('./index.html', import.meta.url));
  const js = readFileSync(new URL('./dashboard.js', import.meta.url));
  const css = readFileSync(new URL('./style.css', import.meta.url));
  const server = createServer(async (req, res) => {
    const send = (status, value, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
      res.end(type === 'application/json' ? JSON.stringify(value) : value);
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (publicUrl.protocol === 'https:')
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    // Host validation prevents DNS rebinding of the loopback service. Do not trust forwarded headers.
    if (req.headers.host !== publicUrl.host) return send(403, { error: 'Invalid host' });
    const path = new URL(req.url, origin).pathname;
    const read = async () => {
      if (req.headers['content-type']?.split(';')[0] !== 'application/json')
        throw new Error('body');
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw new Error('body');
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    };
    const cookie = /(?:^|; )vav_owner=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const authorized = cookie && (logins.get(hash(cookie)) || 0) > clock();
    const sameOrigin = req.headers.origin === origin;
    const ip = clientAddress(req.socket.remoteAddress, req.headers, trustLocalProxy);
    try {
      if (req.method === 'GET' && path === '/') return send(200, html, 'text/html');
      if (req.method === 'GET' && path === '/dashboard.js') return send(200, js, 'text/javascript');
      if (req.method === 'GET' && path === '/style.css') return send(200, css, 'text/css');
      if (req.method === 'GET' && path === '/health') return send(200, { ok: true });
      if (req.method === 'POST' && path === '/owner/login') {
        if (!sameOrigin) return send(403, { error: 'Origin refused' });
        if (!limit(`login:${ip}`, 10, 900000))
          return send(429, { error: 'Réessaie dans 15 minutes.' });
        const body = await read();
        if (
          !exact(body, ['secret']) ||
          typeof body.secret !== 'string' ||
          !timingSafeEqual(Buffer.from(hash(body.secret)), Buffer.from(hash(secret)))
        )
          return send(401, { error: 'Clé incorrecte.' });
        if (logins.size >= 100) logins.delete(logins.keys().next().value);
        const token = randomBytes(32).toString('hex');
        logins.set(hash(token), clock() + 3600000);
        res.setHeader(
          'Set-Cookie',
          `vav_owner=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${publicUrl.protocol === 'https:' ? '; Secure' : ''}`,
        );
        return send(200, { ok: true });
      }
      if (path.startsWith('/owner/')) {
        if (!authorized) return send(401, { error: 'Connexion propriétaire requise.' });
        if (req.method === 'POST' && path === '/owner/logout') {
          if (!sameOrigin) return send(403, { error: 'Origin refused' });
          logins.delete(hash(cookie));
          res.setHeader('Set-Cookie', 'vav_owner=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
          return send(200, { ok: true });
        }
        if (req.method === 'GET' && path === '/owner/stats') {
          purge();
          const since = clock() - 30 * 86400000;
          const totals = db
            .prepare(
              'SELECT COUNT(DISTINCT installation) installations, COUNT(DISTINCT installation || session) sessions FROM sessions WHERE last_seen >= ?',
            )
            .get(since);
          const active = db
            .prepare('SELECT COUNT(DISTINCT installation) count FROM sessions WHERE last_seen >= ?')
            .get(clock() - 86400000).count;
          const daily = db
            .prepare(
              'SELECT day, COUNT(DISTINCT installation) installations, COUNT(DISTINCT installation || session) sessions FROM sessions WHERE last_seen >= ? GROUP BY day ORDER BY day',
            )
            .all(since);
          const versions = db
            .prepare(
              'SELECT version, COUNT(DISTINCT installation) installations FROM sessions WHERE last_seen >= ? GROUP BY version ORDER BY installations DESC',
            )
            .all(since);
          const metrics = db
            .prepare(
              'SELECT operation,outcome,SUM(count) count,SUM(milliseconds) milliseconds FROM metrics JOIN sessions USING(installation,session,day) WHERE last_seen >= ? GROUP BY operation,outcome',
            )
            .all(since);
          return send(200, {
            totals: { ...totals, active },
            daily,
            versions,
            metrics,
            updatedAt: new Date(clock()).toISOString(),
            retentionDays: 90,
          });
        }
        return send(404, { error: 'Not found' });
      }
      if (path === '/v1/report' || path === '/v1/participation') {
        // Desktop clients send no browser Origin; a website cannot enroll on their behalf.
        if (req.headers.origin) return send(403, { error: 'Desktop only' });
        const credential = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
        if (!credential) return send(401, { error: 'Installation credential required' });
        const installation = hash(credential);
        if (!limit(`ingest:${ip}`, 120) || !limit(`installation:${installation}`, 12))
          return send(429, { error: 'Rate limited' });
        if (req.method === 'DELETE' && path === '/v1/participation') {
          db.exec('BEGIN');
          try {
            db.prepare('DELETE FROM sessions WHERE installation=?').run(installation);
            db.prepare(
              'INSERT INTO deleted VALUES(?,?) ON CONFLICT(installation) DO UPDATE SET expires=excluded.expires',
            ).run(installation, clock() + 90 * 86400000);
            db.exec('COMMIT');
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
          return send(200, { deleted: true });
        }
        if (req.method === 'POST' && path === '/v1/report') {
          if (
            db
              .prepare('SELECT 1 FROM deleted WHERE installation=? AND expires>?')
              .get(installation, clock())
          )
            return send(410, { error: 'Participation deleted' });
          const body = await read();
          if (!validate(body)) return send(400, { error: 'Invalid aggregate report' });
          const utcDay = Math.floor(clock() / 86400000);
          if (valueOutsideDay(body.day, utcDay))
            return send(400, { error: 'Report day outside accepted window' });
          const day = new Date(body.day * 86400000).toISOString().slice(0, 10);
          const args = [installation, body.session, day];
          // One cumulative snapshot per session per UTC day. Retries never add duplicate requests.
          const previous = db
            .prepare('SELECT version FROM sessions WHERE installation=? AND session=? AND day=?')
            .get(...args);
          if (previous && previous.version !== body.version)
            return send(400, { error: 'Session version changed' });
          if (
            !previous &&
            (db
              .prepare('SELECT COUNT(*) n FROM sessions WHERE installation=? AND day=?')
              .get(installation, day).n >= 100 ||
              db.prepare('SELECT COUNT(*) n FROM sessions').get().n >= 1000000)
          )
            return send(429, { error: 'Storage quota reached' });
          db.exec('BEGIN');
          try {
            db.prepare(
              'INSERT INTO sessions VALUES(?,?,?,?,?,?) ON CONFLICT(installation,session,day) DO UPDATE SET last_seen=excluded.last_seen',
            ).run(...args, body.version, clock(), clock());
            for (const m of body.metrics)
              db.prepare(
                'INSERT INTO metrics VALUES(?,?,?,?,?,?,?) ON CONFLICT(installation,session,day,operation,outcome) DO UPDATE SET count=MAX(count,excluded.count),milliseconds=MAX(milliseconds,excluded.milliseconds)',
              ).run(...args, m.operation, m.outcome, m.count, m.milliseconds);
            db.exec('COMMIT');
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
          return send(202, { accepted: true });
        }
      }
      return send(404, { error: 'Not found' });
    } catch (e) {
      return send(e.message === 'body' || e instanceof SyntaxError ? 400 : 500, {
        error: 'Request could not be processed',
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 30;
  server.setTimeout(10000, (socket) => socket.destroy());
  server.on('close', () => {
    clearInterval(cleanup);
    db.close();
  });
  return server;
}
function valueOutsideDay(day, today) {
  return day < today - 1 || day > today;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.env.VAV_ADMIN_DATA || '.vav-admin');
  mkdirSync(directory, { recursive: true });
  const keyPath = join(directory, 'owner-secret.txt');
  let secret = process.env.VAV_OWNER_SECRET;
  if (!secret) {
    try {
      secret = readFileSync(keyPath, 'utf8').trim();
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      secret = randomBytes(32).toString('hex');
      writeFileSync(keyPath, secret, { flag: 'wx', mode: 0o600 });
    }
  }
  const origin = process.env.VAV_ADMIN_ORIGIN || 'http://127.0.0.1:14830';
  const server = createVaultServer({
    database: join(directory, 'stats.sqlite'),
    secret,
    origin,
    trustLocalProxy: process.env.VAV_TRUST_LOCAL_PROXY === 'true',
  });
  server.listen(Number(process.env.PORT || 14830), '127.0.0.1', () =>
    console.log(
      `VAV Owner: ${origin}\nClé privée dans ${keyPath}\nAucune statistique utilisateur disponible avant consentement et configuration du collecteur.`,
    ),
  );
  process.on('SIGINT', () => server.close());
  process.on('SIGTERM', () => server.close());
}
