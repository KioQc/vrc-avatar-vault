import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CloudDownload, RefreshCw } from 'lucide-react';
import { useSettings } from '../../hooks/useVault';
import { desktop, mockMode } from '../../db/bridge';
import { repository } from '../../db/repository';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { ErrorNotice } from '../../components/common';
import { version } from '../../../package.json';

export type OnlineStatus = {
  configured: boolean;
  available: boolean;
  version?: string;
  notes?: string;
  ready?: boolean;
  feed?: string;
};
export function useOnlineUpdateStatus() {
  const settings = useSettings();
  const automatic = settings.data?.['updates.onlineCheck'] !== 'false';
  return useQuery({
    queryKey: ['online-updates'],
    queryFn: () => invoke<OnlineStatus>('online_update', { operation: 'check' }),
    enabled: desktop && !mockMode && settings.isSuccess && automatic,
    staleTime: 15 * 60 * 1000,
    refetchInterval: automatic ? 15 * 60 * 1000 : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
export function OnlineUpdateCenter() {
  const status = useOnlineUpdateStatus();
  const settings = useSettings();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState<{ downloaded: number; total?: number } | null>(null);
  const native = desktop && !mockMode;
  useEffect(() => {
    if (!native) return;
    const subscription = listen<{ downloaded: number; total?: number }>(
      'app-update-progress',
      (e) => setProgress(e.payload),
    );
    return () => {
      void subscription.then((stop) => stop());
    };
  }, [native]);
  const action = useMutation({
    mutationFn: async (
      operation: 'download' | 'install' | 'check-setting' | 'download-setting',
    ) => {
      if (operation.endsWith('-setting')) {
        const key = operation === 'check-setting' ? 'updates.onlineCheck' : 'updates.autoDownload';
        await repository.setting(key, settings.data?.[key] === 'false' ? 'true' : 'false');
        await client.invalidateQueries({ queryKey: ['settings'] });
        return;
      }
      const result = await invoke<OnlineStatus>('online_update', {
        operation,
        version: status.data?.version,
      });
      client.setQueryData(['online-updates'], result);
    },
  });
  const busy = status.isFetching || action.isPending;
  return (
    <section className="panel update-center" id="settings-online-updates">
      <div className="row spread">
        <div>
          <h2>GitHub automatic updates</h2>
          <p className="muted">Installed: {version} · Stable channel</p>
        </div>
        <CloudDownload size={24} />
      </div>
      <p>
        New versions are checked at startup and every 15 minutes. Downloads are verified with the
        app's signing key. Installation backs up your database and restarts the app.
      </p>
      {[
        ['updates.onlineCheck', 'Check for updates automatically', 'check-setting'],
        ['updates.autoDownload', 'Download verified updates automatically', 'download-setting'],
      ].map(([key, label, operation]) => (
        <div className="settings-row" key={key}>
          <strong>{label}</strong>
          <input
            type="checkbox"
            aria-label={label}
            checked={settings.data?.[key] !== 'false'}
            disabled={!native || busy}
            onChange={() => action.mutate(operation as 'check-setting' | 'download-setting')}
          />
        </div>
      ))}
      {!native && <p className="notice">Available in the Windows application.</p>}
      {status.data?.configured === false && (
        <p className="notice">GitHub releases are not configured in this build yet.</p>
      )}
      {status.data?.configured && !status.data.available && !status.error && (
        <p role="status">You have the latest published version.</p>
      )}
      {status.data?.available && (
        <div className="update-release">
          <strong>
            Version {status.data.version}{' '}
            {status.data.ready ? 'is verified and ready to install' : 'is available'}
          </strong>
          <p className="update-notes">{status.data.notes}</p>
        </div>
      )}
      {busy && (
        <p role="status">
          {progress
            ? `Downloading / verifying… ${(progress.downloaded / 1048576).toFixed(1)} MB${progress.total ? ` / ${(progress.total / 1048576).toFixed(1)} MB` : ''}`
            : 'Contacting GitHub…'}
        </p>
      )}
      {status.error && <ErrorNotice error={status.error} />}
      {action.error && <ErrorNotice error={action.error} />}
      <div className="row">
        <Button
          disabled={!native || busy}
          onClick={() => {
            setProgress(null);
            void status.refetch();
          }}
        >
          <RefreshCw size={14} /> Check GitHub now
        </Button>
        {status.data?.available && (
          <Button
            variant="default"
            disabled={!native || busy}
            onClick={() => (status.data.ready ? setConfirm(true) : action.mutate('download'))}
          >
            {status.data.ready ? 'Install & restart' : 'Download update'}
          </Button>
        )}
      </div>
      {status.dataUpdatedAt > 0 && (
        <small className="muted">
          Last successful check: {new Date(status.dataUpdatedAt).toLocaleString()}
        </small>
      )}
      <Modal
        open={confirm}
        onOpenChange={(value) => {
          if (!action.isPending) setConfirm(value);
        }}
        title={`Install version ${status.data?.version}?`}
        description="Save unfinished edits first. Your database will be backed up, then the app will close for the update."
      >
        <p>
          Your avatars, screenshots, account credentials and settings remain in their existing
          storage.
        </p>
        {action.error && <ErrorNotice error={action.error} />}
        <div className="dialog-actions">
          <Button disabled={action.isPending} onClick={() => setConfirm(false)}>
            Later
          </Button>
          <Button variant="default" disabled={busy} onClick={() => action.mutate('install')}>
            Back up, install & restart
          </Button>
        </div>
      </Modal>
    </section>
  );
}
