import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../api/VRChatApiClient', () => ({ vrchat: { refreshAvatar: vi.fn() } }));
vi.mock('../db/repository', () => ({ repository: { avatars: vi.fn(), saveAvatar: vi.fn() } }));
import { vrchat } from '../api/VRChatApiClient';
import { repository } from '../db/repository';
import { importAvatars } from './importAvatars';
import rawFixture from '../fixtures/avatar-pc-quest.json';
import { parseVRChatAvatar } from '../utils/domain';
const fixture = parseVRChatAvatar(rawFixture);
import type { Avatar } from '../types/domain';
beforeEach(() => vi.clearAllMocks());
it('continues after a failed avatar and retrying those IDs leaves successes alone', async () => {
  vi.mocked(repository.avatars).mockResolvedValue([]);
  vi.mocked(vrchat.refreshAvatar)
    .mockRejectedValueOnce(new Error('Temporary failure'))
    .mockResolvedValueOnce(fixture);
  const ids = [fixture.id, 'avtr_00000000-0000-4000-8000-000000000002'];
  const first = await importAvatars(ids, false, vi.fn());
  expect(first.imported).toBe(1);
  expect(first.failures.map((f) => f.id)).toEqual([fixture.id]);
  vi.mocked(vrchat.refreshAvatar).mockResolvedValue(fixture);
  const retry = await importAvatars(
    first.failures.map((f) => f.id),
    false,
    vi.fn(),
  );
  expect(retry.imported).toBe(1);
  expect(vrchat.refreshAvatar).toHaveBeenCalledTimes(3);
});
it('skips existing avatars by default, and passes their full local record when refreshing', async () => {
  const previous = {
    id: 'local',
    vrchat_id: fixture.id,
    notes: 'Keep me',
    custom_version: '2.1.0',
    favorite: 1,
  } as Avatar;
  vi.mocked(repository.avatars).mockResolvedValue([previous]);
  expect((await importAvatars([fixture.id, fixture.id], false, vi.fn())).skipped).toBe(1);
  expect(vrchat.refreshAvatar).not.toHaveBeenCalled();
  vi.mocked(vrchat.refreshAvatar).mockResolvedValue(fixture);
  expect((await importAvatars([fixture.id], true, vi.fn())).refreshed).toBe(1);
  expect(repository.saveAvatar).toHaveBeenCalledWith(fixture, previous);
  expect(previous.notes).toBe('Keep me');
});
