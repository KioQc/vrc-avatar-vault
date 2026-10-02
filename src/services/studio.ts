import { invoke } from '@tauri-apps/api/core';
import { query, execute, statement as s, mockMode } from '../db/bridge';
import { repository, uid } from '../db/repository';
import {
  technicalSchema,
  type Bug,
  type StudioSnapshot,
  type WorkSession,
  type Batch,
} from '../types/studio';
export const studio = {
  snapshots: (id: string) =>
    query<StudioSnapshot>(
      'SELECT * FROM studio_snapshots WHERE avatar_id=? ORDER BY created_at DESC LIMIT 200',
      id,
    ),
  bugs: (id: string) =>
    query<Bug>('SELECT * FROM bugs WHERE avatar_id=? ORDER BY updated_at DESC', id),
  sessions: (id: string) =>
    query<WorkSession>(
      'SELECT * FROM work_sessions WHERE avatar_id=? ORDER BY started_at DESC LIMIT 500',
      id,
    ),
  batches: (id: string) =>
    query<Batch>(
      'SELECT * FROM development_batches WHERE avatar_id=? ORDER BY updated_at DESC LIMIT 100',
      id,
    ),
  async action(operationName: string, payload: Record<string, unknown>) {
    if (mockMode)
      throw new Error('This operation needs the desktop app. No native data is simulated.');
    return invoke<{ id?: string }>('studio', { operationName, payload });
  },
  async saveBug(avatarId: string, b: Partial<Bug>) {
    if (!b.title?.trim()) throw new Error('Bug title required');
    const time = new Date().toISOString();
    const id = b.id ?? uid();
    await execute([
      s(
        `INSERT INTO bugs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,severity=excluded.severity,status=excluded.status,found_version=excluded.found_version,target_version=excluded.target_version,steps=excluded.steps,expected=excluded.expected,actual=excluded.actual,known_issue=excluded.known_issue,attachment_ids=excluded.attachment_ids,updated_at=excluded.updated_at,resolved_at=excluded.resolved_at`,
        id,
        avatarId,
        b.title.trim(),
        b.description ?? '',
        b.severity ?? 'Medium',
        b.status ?? 'Open',
        b.found_version ?? '',
        b.target_version ?? '',
        b.steps ?? '',
        b.expected ?? '',
        b.actual ?? '',
        b.known_issue ?? 0,
        b.attachment_ids ?? '[]',
        b.created_at ?? time,
        time,
        b.status === 'Fixed' ? (b.resolved_at ?? time) : null,
      ),
      s(
        'INSERT INTO activity_log VALUES(?,?,?,?,?)',
        uid(),
        avatarId,
        'bug',
        `Bug ${b.status ?? 'Open'}: ${b.title}`,
        time,
      ),
    ]);
  },
  async importTechnical(
    avatarId: string,
    value: unknown,
    label: string,
    releaseId: string | null = null,
  ) {
    const data = technicalSchema.parse(value);
    return this.action('snapshot', { avatarId, kind: 'technical', label, releaseId, data });
  },
  async acceptSuggestion(avatarId: string, title: string, evidence: string) {
    return repository.saveChange(avatarId, {
      title,
      description: evidence,
      categories: ['Changed'],
      importance: 'Normal',
      platform: 'All',
      release_id: null,
      created_at: new Date().toISOString(),
    });
  },
};
