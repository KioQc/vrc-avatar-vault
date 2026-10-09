import { expect, it } from 'vitest';
import { filterImport, readCollections } from './library';
import fixture from '../fixtures/avatar-pc-quest.json';
import { parseVRChatAvatar } from './domain';
it('combines status, presence and search across all loaded avatars', () => {
  const a = parseVRChatAvatar({ ...fixture, name: 'Alpha', releaseStatus: 'private' });
  const b = parseVRChatAvatar({
    ...fixture,
    id: 'avtr_00000000-0000-4000-8000-000000000002',
    name: 'Beta',
    releaseStatus: 'public',
  });
  expect(
    filterImport([b, a], [a.id], {
      search: 'alp',
      status: 'private',
      platform: 'all',
      presence: 'existing',
      sort: 'name',
    }),
  ).toEqual([a]);
  expect(
    filterImport([b, a], [a.id], {
      search: '',
      status: 'all',
      platform: 'all',
      presence: 'new',
      sort: 'name',
    }),
  ).toEqual([b]);
});
it('collections keep memberships in local settings and reject malformed data', () => {
  const groups = [{ id: 'c', name: 'Client', avatarIds: ['one', 'two'] }];
  expect(readCollections(JSON.stringify(groups))).toEqual(groups);
  expect(readCollections('{broken')).toEqual([]);
  expect(readCollections(JSON.stringify([{ id: 'c', name: 'Client', avatarIds: [23] }]))).toEqual(
    [],
  );
});
