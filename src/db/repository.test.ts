import { beforeEach, describe, it, expect, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import fs from 'node:fs';
import type { Scalar, Statement } from './bridge';
let db: Database;
vi.mock('./bridge', () => ({
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
import { repository } from './repository';
import { addVersionIncrement, parseVRChatAvatar } from '../utils/domain';
import fixture from '../fixtures/avatar-pc-quest.json';
beforeEach(async () => {
  db?.close();
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(fs.readFileSync('src-tauri/migrations/001_initial.sql', 'utf8'));
  db.run(fs.readFileSync('src-tauri/migrations/002_unity.sql', 'utf8'));
  db.run(fs.readFileSync('src-tauri/migrations/003_studio.sql', 'utf8'));
  db.run('PRAGMA foreign_keys=ON');
});
describe('SQLite integration', () => {
  it('imports, persists snapshots and rejects duplicate IDs atomically', async () => {
    const data = parseVRChatAvatar(fixture);
    const id = await repository.saveAvatar(data);
    expect((await repository.avatars())[0].id).toBe(id);
    await expect(repository.saveAvatar(data)).rejects.toThrow();
    expect(await repository.snapshots(id)).toHaveLength(1);
    const old = (await repository.avatars())[0];
    await repository.saveAvatar({ ...data, name: 'New name', version: 69 }, old);
    const snapshots = await repository.snapshots(id);
    expect(snapshots).toHaveLength(2);
    expect((await repository.snapshot(snapshots[1].id)).name).toBe(data.name);
  });
  it('creates a release with only selected unreleased changes and keeps local version separate', async () => {
    const id = await repository.saveAvatar(parseVRChatAvatar(fixture));
    const input = {
      title: 'Fix hoodie',
      description: 'Quest clipping',
      importance: 'Normal' as const,
      platform: 'Quest' as const,
      categories: ['Fixed' as const],
      release_id: null,
      created_at: new Date().toISOString(),
    };
    const first = await repository.saveChange(id, input);
    await repository.saveChange(id, { ...input, title: 'More work' });
    await repository.createRelease(id, '1.0.0', 'First release', 'Notes', [first]);
    const changes = await repository.changes(id);
    expect(changes.filter((c) => !c.release_id)).toHaveLength(1);
    expect(changes.find((c) => c.id === first)?.categories).toEqual(['Fixed']);
    expect((await repository.avatars())[0].custom_version).toBe('1.0.0');
    expect((await repository.avatars())[0].data.version).toBe(68);
    await expect(repository.createRelease(id, '1.0.0', 'Duplicate', '', [])).rejects.toThrow();
    expect(await repository.releases(id)).toHaveLength(1);
  });
  it('stores notes, tags, tasks, attachments and cascades a local deletion', async () => {
    const id = await repository.saveAvatar(parseVRChatAvatar(fixture));
    await repository.updateAvatar(id, { notes: '# Notes' });
    await repository.addTag([id], 'Main');
    await repository.addTodo(id, 'Task', 'High');
    await repository.addAttachment({
      avatar_id: id,
      changelog_entry_id: null,
      path: 'test.png',
      type: 'Before',
      caption: 'Test',
    });
    expect(await repository.attachments(id)).toHaveLength(1);
    expect((await repository.avatars())[0].notes).toBe('# Notes');
    expect((await repository.avatars())[0].tags).toEqual(['Main']);
    await repository.removeAvatars([id]);
    expect(await repository.todos(id)).toHaveLength(0);
    expect(await repository.snapshots(id)).toHaveLength(0);
  });
  it('prevents linking an entry to another avatar’s release', async () => {
    const id = await repository.saveAvatar(parseVRChatAvatar(fixture));
    const other = await repository.fork((await repository.avatars())[0]);
    await repository.createRelease(other, '1.0.0', 'Other', '', []);
    const release = (await repository.releases(other))[0];
    await expect(
      repository.saveChange(id, {
        title: 'Test',
        description: '',
        categories: ['Other'],
        importance: 'Normal',
        platform: 'All',
        release_id: release.id,
        created_at: new Date().toISOString(),
      }),
    ).rejects.toThrow();
    expect(await repository.changes(id)).toHaveLength(0);
  });
});

it('does not accumulate snapshots for unchanged 30-second polls and preserves release naming', async () => {
  const data = parseVRChatAvatar({ ...fixture, name: "Kio's Rex" });
  const id = await repository.saveAvatar(data);
  await repository.createRelease(id, '1.1.3', 'Release', '', []);
  let avatar = (await repository.avatars())[0];
  expect(avatar.name).toBe("Kio's Rex v1.1.3");
  await repository.saveAvatar(data, avatar);
  expect(await repository.snapshots(id)).toHaveLength(1);
  avatar = (await repository.avatars())[0];
  await repository.saveAvatar({ ...data, version: data.version + 1 }, avatar);
  expect(await repository.snapshots(id)).toHaveLength(2);
  expect((await repository.avatars())[0].name).toBe("Kio's Rex v1.1.3");
});

it('publishes cumulative increments from persisted versions without duplicating the name suffix', async () => {
  const id = await repository.saveAvatar(parseVRChatAvatar(fixture));
  await repository.createRelease(id, '1.0.0', 'Initial', '', []);
  for (const expected of ['1.1.0', '1.2.0']) {
    const current = (await repository.avatars())[0];
    await repository.createRelease(
      id,
      addVersionIncrement(current.custom_version, '0.1.0'),
      'Next',
      '',
      [],
    );
    expect((await repository.avatars())[0].custom_version).toBe(expected);
    expect((await repository.avatars())[0].name.endsWith(` v${expected}`)).toBe(true);
  }
  expect(await repository.releases(id)).toHaveLength(3);
});
