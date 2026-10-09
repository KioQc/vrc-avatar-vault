import studioMigration from '../../src-tauri/migrations/003_studio.sql?raw';
import initSqlJs from 'sql.js';
import wasm from 'sql.js/dist/sql-wasm.wasm?url';
import unityMigration from '../../src-tauri/migrations/002_unity.sql?raw';
import migration from '../../src-tauri/migrations/001_initial.sql?raw';
import type { Scalar, Statement } from './bridge';
import pcQuest from '../fixtures/avatar-pc-quest.json';
import pcOnly from '../fixtures/avatar-pc-only.json';
import privateAvatar from '../fixtures/avatar-private.json';
const key = 'vrc-vault-explicit-development-fixture-db';
const database = initSqlJs({ locateFile: () => wasm }).then((SQL) => {
  const saved = localStorage.getItem(key);
  const db = saved
    ? new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)))
    : new SQL.Database();
  db.run(migration);
  db.run(unityMigration);
  db.run(studioMigration);
  db.run('PRAGMA foreign_keys=ON');
  return db;
});
export async function mockQuery<T>(sql: string, params: Scalar[]) {
  const db = await database;
  const st = db.prepare(sql);
  try {
    st.bind(params.map((v) => (typeof v === 'boolean' ? Number(v) : v)));
    const rows: T[] = [];
    while (st.step()) rows.push(st.getAsObject() as T);
    return rows;
  } finally {
    st.free();
  }
}
export async function mockExecute(statements: Statement[]) {
  const db = await database;
  db.run('BEGIN');
  try {
    for (const s of statements)
      db.run(
        s.sql,
        s.params.map((v) => (typeof v === 'boolean' ? Number(v) : v)),
      );
    db.run('COMMIT');
    const bytes = db.export();
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    localStorage.setItem(key, btoa(str));
  } catch (e) {
    try {
      db.run('ROLLBACK');
    } catch {
      /* transaction may have committed before browser quota failure */
    }
    throw e;
  }
}
export function mockApi(operation: string, payload: Record<string, string>) {
  if (operation === 'own_avatars') {
    return Number(payload.offset ?? 0) === 0
      ? structuredClone([pcQuest, pcOnly, privateAvatar])
      : [];
  }
  if (operation === 'avatar') {
    const fixture = [pcQuest, pcOnly, privateAvatar].find((a) => a.id === payload.id);
    if (!fixture)
      throw new Error(
        'Fixture ID not found. Use one of the three IDs shown in the development banner.',
      );
    return structuredClone(fixture);
  }
  if (operation === 'verify2fa') return { verified: true };
  if (operation === 'logout') return {};
  return { id: 'usr_00000000-0000-4000-8000-000000000001', displayName: 'Development fixtures' };
}
