import { useUI } from '../stores/ui';
import { invoke } from '@tauri-apps/api/core';
import { mockMode } from '../db/bridge';
import { parseVRChatAvatar, validateAvatarId } from '../utils/domain';
import type { ApiAvatar, User } from '../types/domain';
export interface VRChatApiClient {
  login(username: string, password: string): Promise<User>;
  verifySession(): Promise<User>;
  verify2FA(kind: string, code: string): Promise<User>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User>;
  getAvatar(id: string): Promise<ApiAvatar>;
  getOwnAvatars(offset?: number): Promise<ApiAvatar[]>;
  getAllOwnAvatars(onProgress?: (count: number) => void): Promise<ApiAvatar[]>;
  refreshAvatar(id: string): Promise<ApiAvatar>;
  renameAvatar(id: string, name: string): Promise<ApiAvatar>;
  clearCache(): void;
}
class DesktopVRChatClient implements VRChatApiClient {
  private cache = new Map<string, { value: ApiAvatar; time: number }>();
  ttl = 15 * 60 * 1000;
  private async call<T>(operation: string, payload: Record<string, string> = {}): Promise<T> {
    if (mockMode) {
      const { mockApi } = await import('../db/mock');
      return mockApi(operation, payload) as T;
    }
    try {
      return await invoke<T>('vrchat', { operation, payload });
    } catch (error) {
      if (String(error).includes('session expired')) {
        this.clearCache();
        useUI.getState().setUser(null);
      }
      throw error;
    }
  }
  login(username: string, password: string) {
    return this.call<User>('login', { username, password });
  }
  verifySession() {
    return this.call<User>('session');
  }
  getCurrentUser() {
    return this.verifySession();
  }
  async verify2FA(kind: string, code: string) {
    const result = await this.call<{ verified?: boolean }>('verify2fa', { kind, code });
    if (!result.verified) throw new Error('Verification failed. Check the code and retry.');
    return this.verifySession();
  }
  async logout() {
    useUI.getState().setUser(null);
    try {
      await this.call('logout');
    } finally {
      this.clearCache();
    }
  }
  async getAvatar(id: string) {
    if (!validateAvatarId(id)) throw new Error('Invalid avatar ID');
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.time < this.ttl) return cached.value;
    return this.refreshAvatar(id);
  }
  async getOwnAvatars(offset = 0) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
      throw new Error('Invalid avatar offset');
    const result = await this.call<unknown>('own_avatars', { offset: String(offset) });
    if (!Array.isArray(result)) throw new Error('VRChat returned an invalid avatar list');
    return result.map(parseVRChatAvatar);
  }
  async getAllOwnAvatars(onProgress?: (count: number) => void) {
    const avatars = new Map<string, ApiAvatar>();
    let offset = 0;
    while (offset <= 10000) {
      const page = await this.getOwnAvatars(offset);
      if (!page.length) return [...avatars.values()];
      const previousCount = avatars.size;
      for (const avatar of page) avatars.set(avatar.id, avatar);
      if (avatars.size === previousCount)
        throw new Error('VRChat returned a repeated page. Refresh the list and retry.');
      offset += page.length;
      onProgress?.(avatars.size);
    }
    throw new Error('Account avatar pagination limit reached. No partial list imported.');
  }
  async refreshAvatar(id: string) {
    if (!validateAvatarId(id)) throw new Error('Invalid avatar ID');
    const value = parseVRChatAvatar(await this.call('avatar', { id }));
    if (value.id.toLowerCase() !== id.toLowerCase())
      throw new Error('VRChat returned a different avatar ID');
    this.cache.set(id, { value, time: Date.now() });
    return value;
  }
  clearCache() {
    this.cache.clear();
  }
  async renameAvatar(id: string, name: string) {
    if (!validateAvatarId(id)) throw new Error('Invalid avatar ID');
    name = name.trim();
    if (
      !name ||
      [...name].length > 100 ||
      [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      throw new Error('Invalid avatar name');
    const value = parseVRChatAvatar(await this.call('rename_avatar', { id, name }));
    if (value.id.toLowerCase() !== id.toLowerCase())
      throw new Error('VRChat returned a different avatar ID');
    this.cache.delete(id);
    return value;
  }
}
export const vrchat = new DesktopVRChatClient();
