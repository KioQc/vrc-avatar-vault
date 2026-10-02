import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { ErrorNotice } from '../../components/common';
import { desktop, mockMode } from '../../db/bridge';
import { useSettings } from '../../hooks/useVault';
import { repository } from '../../db/repository';
import { version as appVersion } from '../../../package.json';

type Release = { version: string; installer: string; sha256: string; size: number; notes: string };
export type UpdateStatus = {
  current: string;
  folder: string;
  release: Release | null;
  available: boolean;
  warning?: string;
};
type Prepared = { token: string; release: Release };
const native = desktop && !mockMode;
export function useUpdateStatus() {
  const { data: settings } = useSettings();
  return useQuery({
    queryKey: ['app-updates'],
    queryFn: () => invoke<UpdateStatus>('app_updates', { operation: 'status' }),
    enabled: native,
    refetchInterval:
      settings?.['updates.autoCheck'] === 'true' && !!settings?.['updates.folder'] ? 30000 : false,
    refetchIntervalInBackground: true,
    staleTime: 15000,
    retry: false,
  });
}
export function UpdateCenter() {
  const status = useUpdateStatus();
  const { data: settings } = useSettings();
  const client = useQueryClient();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [installed, setInstalled] = useState<{ version: string; backup: string } | null>(null);
  const action = useMutation({
    mutationFn: async (operation: 'folder' | 'prepare' | 'install' | 'auto') => {
      if (operation === 'folder') {
        const folder = await open({
          directory: true,
          multiple: false,
          title: 'Choose the folder containing latest.vault-update.json',
          defaultPath: status.data?.folder || undefined,
        });
        if (typeof folder !== 'string') return;
        await invoke('app_updates', { operation, folder });
        setPrepared(null);
        setInstalled(null);
      } else if (operation === 'auto') {
        await repository.setting(
          'updates.autoCheck',
          settings?.['updates.autoCheck'] === 'true' ? 'false' : 'true',
        );
      } else if (operation === 'prepare') {
        setPrepared(null);
        setPrepared(await invoke<Prepared>('app_updates', { operation }));
      } else if (prepared) {
        const result = await invoke<{ version: string; backup: string }>('app_updates', {
          operation,
          token: prepared.token,
        });
        setInstalled(result);
        setPrepared(null);
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['app-updates'] });
      void client.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  const release = status.data?.release;
  return (
    <section className="panel update-center" id="settings-updates">
      <div className="row spread">
        <div>
          <h2>Application updates</h2>
          <p className="muted">
            VRC Avatar Vault · Installed version {status.data?.current ?? appVersion}
          </p>
        </div>
        <Download size={24} />
      </div>
      {!native && <p className="notice">Updates are available in the Windows application.</p>}
      <div className="settings-row">
        <div>
          <strong>Update folder</strong>
          <p>
            Extract the update package here. Keep the installer and its release manifest together.
          </p>
          <code className="break-all">{status.data?.folder || 'No folder selected'}</code>
        </div>
        <Button disabled={!native || action.isPending} onClick={() => action.mutate('folder')}>
          <FolderOpen size={14} /> Choose folder
        </Button>
      </div>
      <div className="settings-row">
        <div>
          <strong>Check this folder every 30 seconds</strong>
          <p>While the app is open. Installation always requires your confirmation.</p>
        </div>
        <input
          aria-label="Check update folder automatically"
          type="checkbox"
          disabled={!native || action.isPending}
          checked={settings?.['updates.autoCheck'] === 'true'}
          onChange={() => action.mutate('auto')}
        />
      </div>
      {status.error && <ErrorNotice error={status.error} />}
      {action.error && <ErrorNotice error={action.error} />}
      {status.data?.warning && (
        <p role="status" className="notice">
          {status.data.warning}
        </p>
      )}
      {release && (
        <div className="update-release">
          <strong>
            {status.data?.available
              ? `Version ${release.version} is available`
              : `No newer version in this folder (package ${release.version})`}
          </strong>
          <p className="update-notes">{release.notes}</p>
          <small className="muted">
            {release.installer} · {(release.size / 1048576).toFixed(1)} MB
          </small>
        </div>
      )}
      <div className="row">
        <Button
          disabled={!native || status.isFetching || action.isPending}
          onClick={() => void status.refetch()}
        >
          <RefreshCw size={14} /> {status.isFetching ? 'Checking…' : 'Check now'}
        </Button>
        <Button
          variant="default"
          disabled={!native || !status.data?.available || action.isPending || !!installed}
          onClick={() => action.mutate('prepare')}
        >
          <ShieldCheck size={14} />{' '}
          {action.isPending && action.variables === 'prepare'
            ? 'Verifying installer…'
            : 'Review & update'}
        </Button>
      </div>
      {status.dataUpdatedAt > 0 && (
        <small className="muted">
          Last checked: {new Date(status.dataUpdatedAt).toLocaleTimeString()}
        </small>
      )}
      {installed && (
        <div role="status" className="notice">
          <strong>Installer opened for version {installed.version}.</strong>
          <p>
            Follow the installation steps and reopen the app. If you cancelled the installer, you
            can try again.
          </p>
          <p>
            Database safety backup: <code className="break-all">{installed.backup}</code>
          </p>
          <Button onClick={() => setInstalled(null)}>Allow retry</Button>
        </div>
      )}
      <p className="muted">
        Your avatars, images and settings remain stored on this PC. A verified database backup is
        created before opening the installer. This section only reads local update packages.
      </p>
      <Modal
        open={!!prepared}
        onOpenChange={(value) => {
          if (!value && !action.isPending) setPrepared(null);
        }}
        title={`Install VRC Avatar Vault ${prepared?.release.version ?? ''}?`}
        description="Save any unfinished edits before continuing. The Windows installer may ask you to close the app."
      >
        <p className="update-notes">{prepared?.release.notes}</p>
        <p>
          File integrity verified (SHA-256). This local package is not digitally signed: continue
          only if it came from a source you trust.
        </p>
        <code className="update-hash">{prepared?.release.sha256}</code>
        {action.error && <ErrorNotice error={action.error} />}
        <div className="dialog-actions">
          <Button disabled={action.isPending} onClick={() => setPrepared(null)}>
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={action.isPending}
            onClick={() => action.mutate('install')}
          >
            {action.isPending ? 'Backing up & opening…' : 'Back up & open installer'}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
