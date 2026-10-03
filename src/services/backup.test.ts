import { beforeEach, it, expect, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import fs from 'node:fs';
import type { Scalar, Statement } from '../db/bridge';
let db: Database;
let input: string | null = null;
let saved = '';
vi.mock('./files', () => ({
  readText: async () => input,
  saveText: async (_name: string, text: string) => {
    saved = text;
  },
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string, args?: { statements: Statement[] }) => {
    if (command === 'db_restore' && args) {
      const { execute } = await import('../db/bridge');
      await execute(args.statements);
    }
    return 'safety.sqlite';
  }),
}));
vi.mock('../db/bridge', () => ({
  mockMode: false,
  statement: (sql: string, ...params: Scalar[]) => ({ sql, params }),
  query: async (sql: string, ...params: Scalar[]) => {
    const st = db.prepare(sql);
    try {
      st.bind(params.map((v) => (typeof v === 'boolean' ? Number(v) : v)));
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally {
      st.free();
    }
  },
  execute: async (stmts: Statement[]) => {
    db.run('BEGIN');
    try {
      for (const s of stmts)
        db.run(
          s.sql,
          s.params.map((v) => (typeof v === 'boolean' ? Number(v) : v)),
        );
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  },
}));
import { studio } from './studio';
import { invoke } from '@tauri-apps/api/core';
import { repository } from '../db/repository';
import { exportBackup, readBackup, restoreBackup } from './backup';
import { parseVRChatAvatar } from '../utils/domain';
import fixture from '../fixtures/avatar-pc-quest.json';
beforeEach(async () => {
  db?.close();
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(fs.readFileSync('src-tauri/migrations/001_initial.sql', 'utf8'));
  db.run(fs.readFileSync('src-tauri/migrations/002_unity.sql', 'utf8'));
  db.run(fs.readFileSync('src-tauri/migrations/003_studio.sql', 'utf8'));
  db.run('PRAGMA foreign_keys=ON');
  saved = '';
  input = null;
  vi.clearAllMocks();
});
it('round-trips a complete vault with history after a safety backup', async () => {
  const id = await repository.saveAvatar(parseVRChatAvatar(fixture));
  await repository.updateAvatar(id, { notes: 'Private notes' });
  await repository.saveChange(id, {
    title: 'Added tracking',
    description: 'Details',
    importance: 'Normal',
    platform: 'PC',
    categories: ['Added'],
    release_id: null,
    created_at: new Date().toISOString(),
  });
  await exportBackup();
  await repository.updateAvatar(id, { notes: 'Later edit' });
  input = saved;
  const backup = await readBackup();
  expect(backup).not.toBeNull();
  await restoreBackup(backup!);
  expect(invoke).toHaveBeenCalledWith(
    'db_restore',
    expect.objectContaining({ statements: expect.any(Array) }),
  );
  expect((await repository.avatars())[0].notes).toBe('Private notes');
  expect(await repository.changes(id)).toHaveLength(1);
  expect(await repository.snapshots(id)).toHaveLength(1);
});
it('rejects invalid versions before restoration', async () => {
  await repository.saveAvatar(parseVRChatAvatar(fixture));
  await exportBackup();
  const data = JSON.parse(saved);
  data.version = 999;
  input = JSON.stringify(data);
  await expect(readBackup()).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  expect(await repository.avatars()).toHaveLength(1);
});
it('rolls back an avatar import when the linked ID already exists', async () => {
  const id = await repository.saveAvatar(parseVRChatAvatar(fixture));
  await exportBackup([id]);
  input = saved;
  const backup = await readBackup();
  await expect(restoreBackup(backup!)).rejects.toThrow();
  expect(await repository.avatars()).toHaveLength(1);
  expect(await repository.snapshots(id)).toHaveLength(1);
});

it('preserves Unity links and dependency snapshots in full exports', async () => {
  const id = await repository.saveAvatar(parseVRChatAvatar(fixture));
  const data = {
    name: 'Project',
    unityVersion: '2022.3.22f1',
    sdkVersion: null,
    source: 'filesystem',
    packages: [],
    warnings: [],
  };
  db.run('INSERT INTO unity_projects VALUES(?,?,?,NULL)', [
    id,
    'C:/Projects/Avatar',
    JSON.stringify(data),
  ]);
  db.run('INSERT INTO unity_dependency_snapshots VALUES(?,?,?,?)', [
    'snap',
    id,
    JSON.stringify({ path: 'C:/Projects/Avatar', project: data }),
    new Date().toISOString(),
  ]);
  await exportBackup();
  input = saved;
  const backup = await readBackup();
  await restoreBackup(backup!);
  expect(db.exec('SELECT path FROM unity_projects')[0].values[0][0]).toBe('C:/Projects/Avatar');
  expect(db.exec('SELECT count(*) FROM unity_dependency_snapshots')[0].values[0][0]).toBe(1);
});
it('imports older backups without Unity tables', async () => {
  await repository.saveAvatar(parseVRChatAvatar(fixture));
  await exportBackup();
  const data = JSON.parse(saved);
  delete data.tables.unity_projects;
  delete data.tables.unity_dependency_snapshots;
  input = JSON.stringify(data);
  const backup = await readBackup();
  await restoreBackup(backup!);
  expect(await repository.avatars()).toHaveLength(1);
});

it('preserves studio bugs and converts restored running sessions to interrupted', async () => {
  const id = await repository.saveAvatar(parseVRChatAvatar(fixture));
  await studio.saveBug(id, { title: 'Broken toggle', known_issue: 1, status: 'Open' });
  const time = new Date().toISOString();
  db.run('INSERT INTO work_sessions VALUES(?,?,?,?,?,?,?,?,?)', [
    'work',
    id,
    '1.0.0',
    'Testing',
    'Running',
    time,
    time,
    null,
    25,
  ]);
  db.run('INSERT INTO project_watch(avatar_id,enabled) VALUES(?,1)', [id]);
  await exportBackup();
  input = saved;
  await restoreBackup((await readBackup())!);
  expect((await studio.bugs(id))[0].title).toBe('Broken toggle');
  expect((await studio.sessions(id))[0]).toMatchObject({
    status: 'Interrupted',
    duration_seconds: 25,
  });
  expect(db.exec('SELECT enabled FROM project_watch')[0].values[0][0]).toBe(0);
  const bug = (await studio.bugs(id))[0];
  await studio.saveBug(id, { ...bug, status: 'Fixed' });
  expect((await studio.bugs(id))[0].resolved_at).toBeTruthy();
});
it('restores backups made before studio tables existed', async () => {
  await repository.saveAvatar(parseVRChatAvatar(fixture));
  await exportBackup();
  const data = JSON.parse(saved);
  for (const table of [
    'project_watch',
    'studio_snapshots',
    'development_batches',
    'bugs',
    'work_sessions',
    'manual_dependencies',
    'release_links',
  ])
    delete data.tables[table];
  input = JSON.stringify(data);
  await restoreBackup((await readBackup())!);
  expect(await repository.avatars()).toHaveLength(1);
});
