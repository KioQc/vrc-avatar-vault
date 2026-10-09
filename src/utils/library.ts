import type { ApiAvatar } from '../types/domain';
import { platforms } from './domain';
export interface Collection {
  id: string;
  name: string;
  avatarIds: string[];
}
export function readCollections(value?: string): Collection[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Collection =>
        !!c &&
        typeof c === 'object' &&
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        Array.isArray(c.avatarIds) &&
        c.avatarIds.every((id: unknown) => typeof id === 'string'),
    );
  } catch {
    return [];
  }
}
export function filterImport(
  avatars: ApiAvatar[],
  existingIds: string[],
  filters: {
    search: string;
    status: string;
    platform: string;
    presence: string;
    sort: string;
  },
) {
  const existing = new Set(existingIds.map((id) => id.toLowerCase()));
  return avatars
    .filter(
      (a) =>
        a.name.toLowerCase().includes(filters.search.toLowerCase()) &&
        (filters.status === 'all' || a.releaseStatus.toLowerCase() === filters.status) &&
        (filters.platform === 'all' || platforms(a).includes(filters.platform)) &&
        (filters.presence === 'all' ||
          existing.has(a.id.toLowerCase()) === (filters.presence === 'existing')),
    )
    .sort((a, b) =>
      filters.sort === 'name'
        ? a.name.localeCompare(b.name)
        : filters.sort === 'created'
          ? b.created_at.localeCompare(a.created_at)
          : b.updated_at.localeCompare(a.updated_at),
    );
}
