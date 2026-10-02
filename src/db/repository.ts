import { execute, query, statement as s, type Statement } from './bridge';
import {
  parseVRChatAvatar,
  validSemver,
  versionedName,
  compareAvatarSnapshots,
} from '../utils/domain';
import {
  changeSchema,
  type ApiAvatar,
  type Avatar,
  type Change,
  type ChangeInput,
  type Release,
  type Todo,
  type Attachment,
  type Activity,
  type Snapshot,
  type OscData,
} from '../types/domain';
const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
const activity = (avatar: string | null, type: string, message: string) =>
  s('INSERT INTO activity_log VALUES(?,?,?,?,?)', uid(), avatar, type, message, now());
type AvatarRow = Omit<Avatar, 'data' | 'tags'> & { data_json: string; tags_json: string };
export const repository = {
  async avatars() {
    const rows = await query<AvatarRow>(
      `SELECT a.*, COALESCE((SELECT json_group_array(t.name) FROM tags t JOIN avatar_tags at ON t.id=at.tag_id WHERE at.avatar_id=a.id),'[]') AS tags_json FROM avatars a ORDER BY favorite DESC,updated_at DESC`,
    );
    return rows.map(({ data_json, tags_json, ...r }) => ({
      ...r,
      data: parseVRChatAvatar(JSON.parse(data_json)),
      tags: JSON.parse(tags_json) as string[],
    }));
  },
  async saveAvatar(data: ApiAvatar, existing?: Avatar) {
    data = parseVRChatAvatar(data);
    const id = existing?.id ?? uid(),
      time = now();
    const statements: Statement[] = [];
    if (existing && !compareAvatarSnapshots(existing.data, data).changed) {
      await execute([
        s(
          'UPDATE avatars SET last_api_refresh_at=?,data_json=? WHERE id=?',
          time,
          JSON.stringify(data),
          id,
        ),
      ]);
      return id;
    }
    if (existing)
      statements.push(
        s(
          'UPDATE avatars SET vrchat_id=?,name=?,data_json=?,last_api_refresh_at=?,updated_at=? WHERE id=?',
          data.id.toLowerCase(),
          existing.name === versionedName(existing.data.name, existing.custom_version)
            ? versionedName(data.name, existing.custom_version)
            : data.name,
          JSON.stringify(data),
          time,
          time,
          id,
        ),
      );
    else
      statements.push(
        s(
          'INSERT INTO avatars(id,vrchat_id,name,created_at,updated_at,last_api_refresh_at,data_json) VALUES(?,?,?,?,?,?,?)',
          id,
          data.id.toLowerCase(),
          data.name,
          time,
          time,
          time,
          JSON.stringify(data),
        ),
      );
    statements.push(
      s(
        'INSERT INTO avatar_snapshots VALUES(?,?,?,?,?)',
        uid(),
        id,
        data.version,
        JSON.stringify(data),
        time,
      ),
      s('DELETE FROM avatar_packages WHERE avatar_id=?', id),
    );
    data.unityPackages.forEach((p) =>
      statements.push(
        s('INSERT INTO avatar_packages VALUES(?,?,?,?)', uid(), id, p.platform, JSON.stringify(p)),
      ),
    );
    statements.push(
      activity(
        id,
        existing ? 'refresh' : 'import',
        `${data.name} ${existing ? 'metadata refreshed' : 'imported'} · VRChat v${data.version}`,
      ),
    );
    await execute(statements);
    return id;
  },
  async updateAvatar(
    id: string,
    patch: Partial<Pick<Avatar, 'favorite' | 'archived' | 'notes' | 'local_cover_path' | 'name'>>,
  ) {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (!keys.length) return;
    await execute([
      s(
        `UPDATE avatars SET ${keys.map((k) => `${k}=?`).join(',')},updated_at=? WHERE id=?`,
        ...keys.map((k) => patch[k] ?? null),
        now(),
        id,
      ),
    ]);
  },
  async removeAvatars(ids: string[]) {
    await execute(
      ids.flatMap((id) => [
        s('DELETE FROM changelog_entries WHERE avatar_id=?', id),
        s('DELETE FROM avatars WHERE id=?', id),
        activity(null, 'delete', 'Local avatar data deleted'),
      ]),
    );
  },
  async fork(a: Avatar) {
    const id = uid(),
      time = now();
    await execute([
      s(
        'INSERT INTO avatars(id,name,custom_version,notes,created_at,updated_at,data_json) VALUES(?,?,?,?,?,?,?)',
        id,
        `${a.name} — local variant`,
        a.custom_version,
        a.notes,
        time,
        time,
        JSON.stringify({ ...a.data, name: `${a.name} — local variant` }),
      ),
      ...a.tags.flatMap((tag) => this.tagStatements(id, tag)),
      activity(id, 'fork', `Created unlinked tracker from ${a.name}`),
    ]);
    return id;
  },
  async link(id: string, data: ApiAvatar) {
    await execute([s('UPDATE avatars SET vrchat_id=? WHERE id=?', data.id, id)]);
  },
  async changes(avatarId?: string) {
    const rows = await query<Omit<Change, 'categories'> & { categories_json: string }>(
      `SELECT c.*,COALESCE((SELECT json_group_array(category_id) FROM changelog_entry_categories WHERE entry_id=c.id),'[]') AS categories_json FROM changelog_entries c ${avatarId ? 'WHERE avatar_id=?' : ''} ORDER BY created_at DESC`,
      ...(avatarId ? [avatarId] : []),
    );
    return rows.map(({ categories_json, ...r }) => ({
      ...r,
      categories: JSON.parse(categories_json) as Change['categories'],
    }));
  },
  async saveChange(avatarId: string, input: ChangeInput, id?: string) {
    input = changeSchema.parse(input);
    const key = id ?? uid(),
      time = now();
    const stmts: Statement[] = [
      s(
        'INSERT INTO changelog_entries VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET release_id=excluded.release_id,title=excluded.title,description=excluded.description,importance=excluded.importance,platform=excluded.platform,created_at=excluded.created_at,updated_at=excluded.updated_at',
        key,
        avatarId,
        input.release_id,
        input.title,
        input.description,
        input.importance,
        input.platform,
        new Date(input.created_at).toISOString(),
        time,
      ),
      s('DELETE FROM changelog_entry_categories WHERE entry_id=?', key),
    ];
    for (const cat of input.categories)
      stmts.push(
        s('INSERT OR IGNORE INTO changelog_categories VALUES(?,?)', cat, cat),
        s('INSERT INTO changelog_entry_categories VALUES(?,?)', key, cat),
      );
    stmts.push(
      s('UPDATE avatars SET updated_at=? WHERE id=?', time, avatarId),
      activity(avatarId, 'change', `${id ? 'Edited' : 'Added'} change: ${input.title}`),
    );
    await execute(stmts);
    return key;
  },
  async deleteChange(id: string) {
    await execute([s('DELETE FROM changelog_entries WHERE id=?', id)]);
  },
  releases(avatarId: string) {
    return query<Release>(
      'SELECT * FROM releases WHERE avatar_id=? ORDER BY released_at DESC',
      avatarId,
    );
  },
  async createRelease(
    avatarId: string,
    version: string,
    title: string,
    description: string,
    changeIds: string[],
  ) {
    if (!validSemver(version)) throw new Error('Use a valid semantic version, e.g. 1.2.3');
    if (!title.trim()) throw new Error('A release title is required');
    const [avatar] = await query<{ name: string }>('SELECT name FROM avatars WHERE id=?', avatarId);
    if (!avatar) throw new Error('Avatar not found');
    const id = uid(),
      time = now();
    await execute([
      s(
        'INSERT INTO releases VALUES(?,?,?,?,?,?,?)',
        id,
        avatarId,
        version,
        title,
        description,
        time,
        time,
      ),
      ...changeIds.map((c) =>
        s(
          'UPDATE changelog_entries SET release_id=?,updated_at=? WHERE id=? AND avatar_id=? AND release_id IS NULL',
          id,
          time,
          c,
          avatarId,
        ),
      ),
      s(
        'UPDATE avatars SET custom_version=?,name=?,updated_at=? WHERE id=?',
        version,
        versionedName(avatar.name, version),
        time,
        avatarId,
      ),
      activity(avatarId, 'release', `Release v${version} created: ${title}`),
    ]);
  },
  snapshots(avatarId: string) {
    return query<Snapshot>(
      'SELECT id,avatar_id,vrchat_version,created_at FROM avatar_snapshots WHERE avatar_id=? ORDER BY created_at DESC LIMIT 500',
      avatarId,
    );
  },
  async snapshot(id: string) {
    const [row] = await query<{ snapshot_json: string }>(
      'SELECT snapshot_json FROM avatar_snapshots WHERE id=?',
      id,
    );
    return parseVRChatAvatar(JSON.parse(row.snapshot_json));
  },
  todos(avatarId: string) {
    return query<Todo>(
      'SELECT * FROM todos WHERE avatar_id=? ORDER BY completed,created_at DESC',
      avatarId,
    );
  },
  async addTodo(avatarId: string, title: string, priority: string) {
    if (!title.trim()) throw new Error('Task title required');
    await execute([
      s('INSERT INTO todos VALUES(?,?,?,?,?,?)', uid(), avatarId, title.trim(), priority, 0, now()),
    ]);
  },
  async toggleTodo(todo: Todo) {
    await execute([s('UPDATE todos SET completed=? WHERE id=?', todo.completed ? 0 : 1, todo.id)]);
  },
  async deleteTodo(id: string) {
    await execute([s('DELETE FROM todos WHERE id=?', id)]);
  },
  tagStatements(avatarId: string, name: string) {
    name = name.trim();
    return [
      s('INSERT OR IGNORE INTO tags VALUES(?,?)', name, name),
      s('INSERT OR IGNORE INTO avatar_tags SELECT ?,id FROM tags WHERE name=?', avatarId, name),
    ];
  },
  async addTag(ids: string[], name: string) {
    if (!name.trim()) return;
    await execute(ids.flatMap((id) => this.tagStatements(id, name)));
  },
  async removeTag(avatarId: string, tag: string) {
    await execute([
      s(
        'DELETE FROM avatar_tags WHERE avatar_id=? AND tag_id=(SELECT id FROM tags WHERE name=?)',
        avatarId,
        tag,
      ),
    ]);
  },
  async renameTag(old: string, next: string) {
    if (!next.trim()) throw new Error('Tag name required');
    await execute([s('UPDATE tags SET name=? WHERE id=?', next.trim(), old)]);
  },
  async deleteTag(name: string) {
    await execute([s('DELETE FROM tags WHERE id=?', name)]);
  },
  tags() {
    return query<{ id: string; name: string; count: number }>(
      'SELECT t.*,COUNT(at.avatar_id) AS count FROM tags t LEFT JOIN avatar_tags at ON at.tag_id=t.id GROUP BY t.id',
    );
  },
  attachments(avatarId: string) {
    return query<Attachment>(
      'SELECT * FROM attachments WHERE avatar_id=? ORDER BY created_at DESC',
      avatarId,
    );
  },
  async addAttachment(a: Omit<Attachment, 'id' | 'created_at'>) {
    await execute([
      s(
        'INSERT INTO attachments VALUES(?,?,?,?,?,?,?)',
        uid(),
        a.avatar_id,
        a.changelog_entry_id,
        a.path,
        a.type,
        a.caption,
        now(),
      ),
    ]);
  },
  async deleteAttachment(a: Attachment) {
    await execute([
      s(
        'UPDATE avatars SET local_cover_path=NULL WHERE id=? AND local_cover_path=?',
        a.avatar_id,
        a.path,
      ),
      s('DELETE FROM attachments WHERE id=?', a.id),
    ]);
  },
  activity() {
    return query<Activity>('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 2000');
  },
  oscSnapshots(id: string) {
    return query<{ id: string; data_json: string; created_at: string }>(
      'SELECT id,data_json,created_at FROM osc_snapshots WHERE avatar_id=? ORDER BY created_at DESC LIMIT 100',
      id,
    );
  },
  async saveOsc(id: string, data: OscData) {
    await execute([
      s('INSERT INTO osc_snapshots VALUES(?,?,?,?)', uid(), id, JSON.stringify(data), now()),
      activity(id, 'osc', 'Local OSC parameters snapshot saved'),
    ]);
  },
  async settings() {
    const rows = await query<{ key: string; value: string }>('SELECT * FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  async setting(key: string, value: string) {
    await execute([
      s(
        'INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        key,
        value,
      ),
    ]);
  },
};
