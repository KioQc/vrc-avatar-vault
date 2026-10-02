import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useQuery } from '@tanstack/react-query';
import { desktop, mockMode } from '../db/bridge';
export async function saveText(name: string, text: string, folder = 'exports') {
  if (mockMode) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const dirs = await invoke<Record<string, { path: string }>>('path_preferences', {
    operation: 'get',
  });
  const path = await save({ defaultPath: `${dirs[folder].path}/${name}` });
  if (path) await invoke('file_transfer', { operation: 'write', path, content: text });
}
export async function readText(): Promise<string | null> {
  if (mockMode)
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = () => {
        const f = input.files?.[0];
        if (f) void f.text().then(resolve);
        else resolve(null);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
  return typeof path === 'string'
    ? invoke('file_transfer', { operation: 'read', path, content: null })
    : null;
}
export async function storeImage(file: File) {
  if (mockMode)
    throw new Error('File storage is desktop-only. Run npm run desktop to attach images.');
  return invoke<string>('add_attachment', {
    name: file.name,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
  });
}
export function useAttachmentUrl(name: string | null | undefined) {
  const info = useQuery({
    queryKey: ['storage'],
    queryFn: () => invoke<{ attachments: string }>('storage_info'),
    enabled: desktop && !mockMode,
    staleTime: Infinity,
  });
  return name && info.data ? convertFileSrc(`${info.data.attachments}/${name}`) : null;
}
export async function openFolder(kind: string, user?: string) {
  if (mockMode) throw new Error('Opening system folders requires the desktop app');
  await invoke('open_folder', { kind, user: user ?? null });
}
