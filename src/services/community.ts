import { invoke } from '@tauri-apps/api/core';
import { desktop, mockMode } from '../db/bridge';
export const COMMUNITY_URL = 'https://discord.gg/evvAZQzjPt';
export async function openCommunity() {
  if (desktop && !mockMode) await invoke('open_community');
  else window.open(COMMUNITY_URL, '_blank', 'noopener,noreferrer');
}
