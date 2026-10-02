import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../db/bridge', () => ({ mockMode: false }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { vrchat } from './VRChatApiClient';
import fixture from '../fixtures/avatar-pc-quest.json';
beforeEach(() => {
  vi.clearAllMocks();
  vrchat.clearCache();
});
it('caches validated avatar reads and forces explicit refresh', async () => {
  vi.mocked(invoke).mockResolvedValue(fixture);
  await vrchat.getAvatar(fixture.id);
  await vrchat.getAvatar(fixture.id);
  expect(invoke).toHaveBeenCalledTimes(1);
  await vrchat.refreshAvatar(fixture.id);
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke).toHaveBeenLastCalledWith('vrchat', {
    operation: 'avatar',
    payload: { id: fixture.id },
  });
});
it('rejects invalid IDs before IPC and mismatched API identities', async () => {
  await expect(vrchat.getAvatar('../auth')).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  vi.mocked(invoke).mockResolvedValue({
    ...fixture,
    id: 'avtr_00000000-0000-4000-8000-000000000002',
  });
  await expect(vrchat.getAvatar(fixture.id)).rejects.toThrow('different avatar ID');
});
it('completes the challenge before restoring the authenticated user', async () => {
  vi.mocked(invoke)
    .mockResolvedValueOnce({ verified: true })
    .mockResolvedValueOnce({ id: 'usr_test', displayName: 'Test' });
  expect(await vrchat.verify2FA('emailotp', '123456')).toEqual({
    id: 'usr_test',
    displayName: 'Test',
  });
  expect(invoke).toHaveBeenNthCalledWith(1, 'vrchat', {
    operation: 'verify2fa',
    payload: { kind: 'emailotp', code: '123456' },
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'vrchat', { operation: 'session', payload: {} });
});
it('does not treat a rejected challenge as authenticated', async () => {
  vi.mocked(invoke).mockResolvedValue({ verified: false });
  await expect(vrchat.verify2FA('totp', '000000')).rejects.toThrow('Verification failed');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('renames only the requested avatar name and does not retry a failed write', async () => {
  vi.mocked(invoke).mockResolvedValue({ ...fixture, name: 'Test v1.1.3' });
  await vrchat.renameAvatar(fixture.id, 'Test v1.1.3');
  expect(invoke).toHaveBeenCalledWith('vrchat', {
    operation: 'rename_avatar',
    payload: { id: fixture.id, name: 'Test v1.1.3' },
  });
  vi.mocked(invoke).mockRejectedValue(new Error('403'));
  await expect(vrchat.renameAvatar(fixture.id, 'Test v1.1.4')).rejects.toThrow('403');
  expect(invoke).toHaveBeenCalledTimes(2);
});
