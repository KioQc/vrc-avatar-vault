import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '../../components/ui/button';
import { useAction } from '../../hooks/useVault';
import { desktop, mockMode } from '../../db/bridge';
import { ErrorNotice } from '../../components/common';
const folders = [
  ['exports', 'Exports', 'Starting folder for JSON, Markdown and OSC exports.'],
  [
    'backupExports',
    'Full vault backups',
    'Starting folder for complete JSON backups, including images.',
  ],
  ['osc', 'VRChat OSC root', 'Select the OSC folder containing usr_… profile folders.'],
  ['screenshots', 'Screenshots', 'Quick access to your VRChat screenshots.'],
  ['unityProjects', 'Unity projects', 'Starting folder when linking a Unity project.'],
  ['unityEditor', 'Unity editor', 'Choose Unity.exe matching the version of your linked project.'],
];
export function FolderSettings() {
  const dirs = useQuery({
    queryKey: ['path-preferences'],
    queryFn: () =>
      invoke<Record<string, { path: string; exists: boolean; custom: boolean }>>(
        'path_preferences',
        { operation: 'get' },
      ),
    enabled: desktop && !mockMode,
  });
  const action = useAction(async ({ kind, operation }: { kind: string; operation: string }) => {
    if (operation === 'open') {
      await invoke('path_preferences', { operation, kind });
      return;
    }
    let path = '';
    if (operation === 'choose') {
      const selected = await open({
        directory: kind !== 'unityEditor',
        multiple: false,
        title: kind === 'unityEditor' ? 'Choose Unity.exe' : 'Choose a folder',
        defaultPath: dirs.data?.[kind]?.path || undefined,
        ...(kind === 'unityEditor'
          ? { filters: [{ name: 'Unity editor', extensions: ['exe'] }] }
          : {}),
      });
      if (typeof selected !== 'string') return;
      path = selected;
    }
    await invoke('path_preferences', { operation: 'set', kind, path });
  });
  return (
    <section className="panel">
      <h2>Folders & Unity</h2>
      <p className="muted">
        Choose folders using Windows dialogs. Exports still ask for a filename. Changing these
        preferences does not move your existing data.
      </p>
      {dirs.error && <ErrorNotice error={dirs.error} />}
      {folders.map(([kind, label, hint]) => (
        <div className="settings-row folder-setting" key={kind}>
          <div>
            <strong>{label}</strong>
            <p>{hint}</p>
            <code className="break-all">{dirs.data?.[kind]?.path || 'Not configured'}</code>
            {dirs.data?.[kind]?.path && !dirs.data[kind].exists && (
              <p className="warning">Folder or executable unavailable</p>
            )}
          </div>
          <div className="row wrap">
            <Button
              disabled={!desktop || mockMode || action.isPending}
              onClick={() => action.mutate({ kind, operation: 'choose' })}
            >
              Choose…
            </Button>
            {kind !== 'unityEditor' && (
              <Button
                disabled={!dirs.data?.[kind]?.exists || action.isPending}
                onClick={() => action.mutate({ kind, operation: 'open' })}
              >
                Open
              </Button>
            )}
            <Button
              disabled={!dirs.data?.[kind]?.custom || action.isPending}
              onClick={() => action.mutate({ kind, operation: 'reset' })}
            >
              Default
            </Button>
          </div>
        </div>
      ))}
      <p className="tiny muted">
        The live database, attachments and automatic safety backups remain in the stable AppData
        folder displayed below. Use a full vault export to keep an additional copy on another drive.
      </p>
    </section>
  );
}
