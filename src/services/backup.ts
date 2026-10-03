import { technicalSchema } from '../types/studio';
import { unityProjectSchema, unityDependencySnapshotSchema } from '../types/unity';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import { execute, query, statement, mockMode, type Scalar } from '../db/bridge';
import { parseVRChatAvatar, validSemver } from '../utils/domain';
import { changeSchema, oscSchema } from '../types/domain';
import { saveText, readText } from './files';
const columns = {
  project_watch: ['avatar_id', 'enabled', 'baseline_id', 'last_scan', 'error'],
  studio_snapshots: [
    'id',
    'avatar_id',
    'release_id',
    'kind',
    'label',
    'platform',
    'source',
    'schema_version',
    'data_json',
    'created_at',
  ],
  development_batches: ['id', 'avatar_id', 'started_at', 'updated_at', 'status', 'data_json'],
  bugs: [
    'id',
    'avatar_id',
    'title',
    'description',
    'severity',
    'status',
    'found_version',
    'target_version',
    'steps',
    'expected',
    'actual',
    'known_issue',
    'attachment_ids',
    'created_at',
    'updated_at',
    'resolved_at',
  ],
  work_sessions: [
    'id',
    'avatar_id',
    'version',
    'description',
    'status',
    'started_at',
    'heartbeat_at',
    'ended_at',
    'duration_seconds',
  ],
  manual_dependencies: [
    'id',
    'avatar_id',
    'name',
    'version',
    'type',
    'source',
    'url',
    'installed_path',
    'notes',
  ],
  release_links: [
    'release_id',
    'avatar_id',
    'snapshot_ids',
    'known_issues_json',
    'api_before',
    'api_after',
    'upload_snapshot_id',
    'association',
  ],

  unity_projects: ['avatar_id', 'path', 'data_json', 'last_opened'],
  unity_dependency_snapshots: ['id', 'avatar_id', 'data_json', 'created_at'],
  avatars: [
    'id',
    'vrchat_id',
    'name',
    'custom_version',
    'archived',
    'favorite',
    'notes',
    'local_cover_path',
    'created_at',
    'updated_at',
    'last_api_refresh_at',
    'data_json',
  ],
  avatar_packages: ['id', 'avatar_id', 'platform', 'data_json'],
  avatar_snapshots: ['id', 'avatar_id', 'vrchat_version', 'snapshot_json', 'created_at'],
  releases: ['id', 'avatar_id', 'version', 'title', 'description', 'released_at', 'created_at'],
  changelog_entries: [
    'id',
    'avatar_id',
    'release_id',
    'title',
    'description',
    'importance',
    'platform',
    'created_at',
    'updated_at',
  ],
  changelog_categories: ['id', 'name'],
  changelog_entry_categories: ['entry_id', 'category_id'],
  tags: ['id', 'name'],
  avatar_tags: ['avatar_id', 'tag_id'],
  todos: ['id', 'avatar_id', 'title', 'priority', 'completed', 'created_at'],
  attachments: ['id', 'avatar_id', 'changelog_entry_id', 'path', 'type', 'caption', 'created_at'],
  osc_snapshots: ['id', 'avatar_id', 'data_json', 'created_at'],
  activity_log: ['id', 'avatar_id', 'type', 'message', 'created_at'],
  settings: ['key', 'value'],
} as const;
type Table = keyof typeof columns;
const order: Table[] = [
  'avatars',
  'avatar_packages',
  'avatar_snapshots',
  'releases',
  'changelog_categories',
  'changelog_entries',
  'changelog_entry_categories',
  'tags',
  'avatar_tags',
  'todos',
  'attachments',
  'osc_snapshots',
  'activity_log',
  'settings',
  'unity_projects',
  'unity_dependency_snapshots',
  'studio_snapshots',
  'project_watch',
  'development_batches',
  'bugs',
  'work_sessions',
  'manual_dependencies',
  'release_links',
];
const backupSchema = z.object({
  format: z.literal('vrc-avatar-vault'),
  version: z.literal(1),
  scope: z.enum(['vault', 'avatar']),
  createdAt: z.string(),
  tables: z.record(
    z.string(),
    z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  ),
  files: z.record(z.string(), z.string()),
});
export async function exportBackup(ids?: string[]) {
  const tables: Record<string, Record<string, Scalar>[]> = {};
  for (const t of order) tables[t] = await query<Record<string, Scalar>>(`SELECT * FROM ${t}`);
  if (ids) {
    const set = new Set(ids);
    for (const t of order) {
      if (t === 'avatars') tables[t] = tables[t].filter((r) => set.has(String(r.id)));
      else if (t === 'settings') tables[t] = [];
      else if (columns[t].some((c) => c === 'avatar_id'))
        tables[t] = tables[t].filter((r) => set.has(String(r.avatar_id)));
    }
    const entries = new Set(tables.changelog_entries.map((r) => r.id));
    tables.changelog_entry_categories = tables.changelog_entry_categories.filter((r) =>
      entries.has(r.entry_id),
    );
  }
  const files: Record<string, string> = {};
  for (const row of tables.attachments) {
    const name = String(row.path);
    if (!mockMode)
      files[name] = await invoke<string>('file_transfer', {
        operation: 'attachment',
        path: name,
        content: null,
      });
  }
  const data = {
    format: 'vrc-avatar-vault',
    version: 1,
    scope: ids ? 'avatar' : 'vault',
    createdAt: new Date().toISOString(),
    tables,
    files,
  };
  await saveText(
    ids ? 'avatar-vault-export.json' : 'avatar-vault-backup.json',
    JSON.stringify(data, null, 2),
    ids ? 'exports' : 'backupExports',
  );
}
export async function readBackup() {
  const text = await readText();
  if (!text) return null;
  const backup = backupSchema.parse(JSON.parse(text));
  for (const t of order) {
    if (
      [
        'unity_projects',
        'unity_dependency_snapshots',
        'studio_snapshots',
        'project_watch',
        'development_batches',
        'bugs',
        'work_sessions',
        'manual_dependencies',
        'release_links',
      ].includes(t)
    )
      backup.tables[t] ??= [];
    const rows = backup.tables[t];
    if (!rows) throw new Error(`Missing backup table: ${t}`);
    for (const row of rows) {
      if (
        Object.keys(row).some((k) => !(columns[t] as readonly string[]).includes(k)) ||
        columns[t].some((k) => !(k in row))
      )
        throw new Error(`Invalid columns in ${t}`);
    }
  }
  for (const project of backup.tables.unity_projects)
    unityProjectSchema.parse(JSON.parse(String(project.data_json)));
  for (const snapshot of backup.tables.unity_dependency_snapshots)
    unityDependencySnapshotSchema.parse(JSON.parse(String(snapshot.data_json)));
  for (const snapshot of backup.tables.studio_snapshots) {
    const data = JSON.parse(String(snapshot.data_json));
    if (snapshot.kind === 'technical') technicalSchema.parse(data);
    else if (
      snapshot.kind !== 'filesystem' ||
      !data.files ||
      typeof data.files !== 'object' ||
      Array.isArray(data.files)
    )
      throw new Error('Invalid filesystem snapshot');
  }
  for (const batch of backup.tables.development_batches) {
    const data = JSON.parse(String(batch.data_json));
    if (!Array.isArray(data.changes)) throw new Error('Invalid development batch');
  }
  for (const bug of backup.tables.bugs) {
    if (!Array.isArray(JSON.parse(String(bug.attachment_ids))) || !String(bug.title).trim())
      throw new Error('Invalid bug');
  }
  for (const session of backup.tables.work_sessions) {
    if (
      !['Running', 'Paused', 'Stopped', 'Interrupted'].includes(String(session.status)) ||
      !Number.isFinite(session.duration_seconds) ||
      Number(session.duration_seconds) < 0
    )
      throw new Error('Invalid work session');
  }
  for (const link of backup.tables.release_links) {
    if (
      !Array.isArray(JSON.parse(String(link.snapshot_ids))) ||
      !Array.isArray(JSON.parse(String(link.known_issues_json)))
    )
      throw new Error('Invalid release links');
  }
  const validDate = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  for (const avatar of backup.tables.avatars) {
    avatar.data_json = JSON.stringify(parseVRChatAvatar(JSON.parse(String(avatar.data_json))));
    if (
      !validSemver(String(avatar.custom_version)) ||
      !validDate(avatar.created_at) ||
      !validDate(avatar.updated_at)
    )
      throw new Error('Invalid avatar version or date in backup');
  }
  for (const snap of backup.tables.avatar_snapshots)
    snap.snapshot_json = JSON.stringify(parseVRChatAvatar(JSON.parse(String(snap.snapshot_json))));
  for (const entry of backup.tables.changelog_entries) {
    const categories = backup.tables.changelog_entry_categories
      .filter((r) => r.entry_id === entry.id)
      .map((r) => r.category_id);
    changeSchema.parse({ ...entry, categories });
    if (!validDate(entry.created_at)) throw new Error('Invalid changelog date in backup');
  }
  for (const release of backup.tables.releases)
    if (!validSemver(String(release.version)) || !validDate(release.released_at))
      throw new Error('Invalid release version or date in backup');
  for (const snapshot of backup.tables.osc_snapshots)
    oscSchema.parse(JSON.parse(String(snapshot.data_json)));
  for (const file of backup.tables.attachments) {
    const name = String(file.path);
    if (!/^[\w-]+\.(png|jpe?g|webp)$/.test(name) || !backup.files[name])
      throw new Error(`Missing or invalid attachment: ${name}`);
  }
  return backup;
}
export type Backup = NonNullable<Awaited<ReturnType<typeof readBackup>>>;
export async function restoreBackup(backup: Backup) {
  if (mockMode) {
    const current: Record<string, unknown> = {};
    for (const t of order) current[t] = await query(`SELECT * FROM ${t}`);
    localStorage.setItem('vrc-vault-mock-safety-backup', JSON.stringify(current));
  }
  const remap = new Map<string, string>();
  for (const row of backup.tables.attachments) {
    const old = String(row.path);
    if (mockMode) throw new Error('Restore backups with images in the desktop app');
    if (!remap.has(old)) {
      const bytes = Array.from(atob(backup.files[old]), (c) => c.charCodeAt(0));
      remap.set(old, await invoke<string>('add_attachment', { name: old, bytes }));
    }
  }
  const statements =
    backup.scope === 'vault'
      ? [
          statement('DELETE FROM changelog_entries'),
          ...[...order].reverse().map((t) => statement(`DELETE FROM ${t}`)),
        ]
      : [];
  for (const t of order)
    for (const source of backup.tables[t]) {
      const row = { ...source };
      if (t === 'work_sessions' && row.status === 'Running') row.status = 'Interrupted';
      if (t === 'project_watch') row.enabled = 0;
      if (t === 'attachments') row.path = remap.get(String(row.path)) ?? row.path;
      if (t === 'avatars' && row.local_cover_path)
        row.local_cover_path = remap.get(String(row.local_cover_path)) ?? null;
      const ignore =
        backup.scope === 'avatar' && ['tags', 'changelog_categories'].includes(t)
          ? ' OR IGNORE'
          : '';
      statements.push(
        statement(
          `INSERT${ignore} INTO ${t} (${columns[t].join(',')}) VALUES (${columns[t].map(() => '?').join(',')})`,
          ...columns[t].map((k) => row[k]),
        ),
      );
    }
  if (mockMode) await execute(statements);
  else await invoke('db_restore', { statements });
}
