import type { FileChange } from '../types/studio';
import type { UnityProjectData } from '../types/unity';
export const changeLabel = (type: string) =>
  ({ Created: 'Added', Deleted: 'Removed' })[type] ?? type;
export function filterFiles(
  changes: FileChange[],
  search: string,
  type: string,
  kind: string,
  folder: string,
) {
  const needle = search.toLowerCase().trim();
  return changes.filter(
    (c) =>
      (!needle || `${c.path} ${c.oldPath ?? ''}`.toLowerCase().includes(needle)) &&
      (type === 'All' || changeLabel(c.type) === type) &&
      (kind === 'All' || c.kind === kind) &&
      (folder === 'All' || fileFolder(c.path) === folder),
  );
}
export const fileFolder = (path: string) =>
  path.replace(/\\/g, '/').split('/').slice(0, -1).join('/') || '(root)';
export function compareFileTrees(
  before: Record<string, { hash?: string | null; size?: number; kind?: string }>,
  after: Record<string, { hash?: string | null; size?: number; kind?: string }>,
) {
  const result: FileChange[] = [];
  const moved = new Set<string>();
  const oldCounts = new Map<string, number>();
  const candidates = new Map<string, Array<[string, (typeof after)[string]]>>();
  const key = (f: (typeof after)[string]) => JSON.stringify([f.hash, f.size]);
  for (const f of Object.values(before))
    if (f.hash) oldCounts.set(key(f), (oldCounts.get(key(f)) ?? 0) + 1);
  for (const [p, f] of Object.entries(after))
    if (!before[p] && f.hash) {
      const list = candidates.get(key(f)) ?? [];
      list.push([p, f]);
      candidates.set(key(f), list);
    }
  for (const [path, old] of Object.entries(before)) {
    const next = after[path];
    if (next) {
      if (
        old.size !== next.size ||
        (old.hash && next.hash
          ? old.hash !== next.hash
          : JSON.stringify(old) !== JSON.stringify(next))
      )
        result.push({ type: 'Modified', path, kind: next.kind ?? old.kind ?? '' });
    } else {
      const matches = old.hash ? (candidates.get(key(old)) ?? []) : [];
      if (matches.length === 1 && oldCounts.get(key(old)) === 1) {
        const [nextPath, next] = matches[0];
        moved.add(nextPath);
        result.push({
          type: 'Renamed',
          path: nextPath,
          oldPath: path,
          kind: next.kind ?? old.kind ?? '',
        });
      } else result.push({ type: 'Deleted', path, kind: old.kind ?? '' });
    }
  }
  for (const [path, file] of Object.entries(after))
    if (!before[path] && !moved.has(path))
      result.push({ type: 'Created', path, kind: file.kind ?? '' });
  return result;
}
export function dependencyDiff(
  before: UnityProjectData['packages'],
  after: UnityProjectData['packages'],
) {
  const left = new Map(before.map((p) => [p.name, p])),
    right = new Map(after.map((p) => [p.name, p]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap((name) => {
    const a = left.get(name),
      b = right.get(name);
    const fields = ['version', 'type', 'origin', 'location', 'reference'] as const;
    if (a && b && fields.every((k) => (a[k] ?? '') === (b[k] ?? ''))) return [];
    return [{ name, type: !a ? 'Added' : !b ? 'Removed' : 'Changed', before: a, after: b }];
  });
}
