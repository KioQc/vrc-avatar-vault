import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
vi.mock('../api/VRChatApiClient', () => ({ vrchat: { getFileAnalysis: vi.fn() } }));
import { vrchat } from '../api/VRChatApiClient';
import { avatarAnalysisOptions, avatarAnalysisPackages } from './useAvatarAnalysis';
import { parseVRChatAvatar } from '../utils/domain';
import fixture from '../fixtures/avatar-pc-quest.json';
it('shares automatic and panel requests while loading a new upload separately', async () => {
  const client = new QueryClient();
  vi.mocked(vrchat.getFileAnalysis).mockResolvedValue({ avatarStats: { totalPolygons: 42 } });
  const ref = { id: 'file_00000000-0000-4000-8000-000000000001', version: 22, variant: 'security' };
  await Promise.all([
    client.fetchQuery(avatarAnalysisOptions(ref)),
    client.fetchQuery(avatarAnalysisOptions(ref)),
  ]);
  await client.fetchQuery(avatarAnalysisOptions(ref));
  expect(vrchat.getFileAnalysis).toHaveBeenCalledTimes(1);
  await client.fetchQuery(avatarAnalysisOptions({ ...ref, version: 23 }));
  expect(vrchat.getFileAnalysis).toHaveBeenCalledTimes(2);
  client.clear();
});
it('prefers the latest native upload and excludes impostors', () => {
  const avatar = parseVRChatAvatar({
    ...fixture,
    unityPackages: [
      { platform: 'android', variant: 'impostor', created_at: '2026-10-09' },
      { platform: 'standalonewindows', variant: 'security', created_at: '2026-10-08' },
      { platform: 'standalonewindows', variant: 'standard', created_at: '2026-10-09' },
      { platform: 'standalonewindows', variant: 'security', created_at: '2026-10-09' },
    ],
  });
  expect(avatarAnalysisPackages(avatar)).toHaveLength(1);
  expect(avatarAnalysisPackages(avatar)[0]).toMatchObject({
    variant: 'security',
    created_at: '2026-10-09',
  });
});
