import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { desktop, mockMode } from '../../db/bridge';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
interface State {
  running: boolean;
  presence?: {
    at: number;
    project: string;
    scene: string;
    avatar: string;
    avatarId: string;
    lastCapture?: { at: number; avatarId: string; automatic: boolean };
    lastResult?: { ok: boolean; message: string };
    command?: { id: string; expires: number };
  };
}
export function BridgeStatus({ avatarId }: { avatarId: string }) {
  const state = useQuery({
    queryKey: ['integration-status'],
    enabled: desktop && !mockMode,
    refetchInterval: 2000,
    queryFn: () => invoke<State>('integration_control', { operation: 'status' }),
  });
  const action = useAction(() =>
    invoke('integration_request', { avatarId, operation: 'capture', relativePath: null }),
  );
  const live = state.data?.presence;
  const connected = !!live && Date.now() / 1000 - live.at < 30;
  const pending = !!live?.command && live.command.expires > Date.now() / 1000;
  return (
    <section className="panel">
      <div className="row between wrap">
        <h3>Unity Bridge · {connected ? 'Connected' : 'Disconnected'}</h3>
        <Button
          disabled={!connected || live?.avatarId !== avatarId || pending || action.isPending}
          onClick={() => action.mutate()}
        >
          Capture selected avatar in Unity
        </Button>
      </div>
      <p className="muted">
        {live
          ? `${live.project} · ${live.scene} · ${live.avatar}`
          : 'Enable the local API in Settings, connect the Bridge and select this avatar tracker.'}
      </p>
      {connected && live?.avatarId !== avatarId && (
        <p className="notice">Select this avatar tracker in the Unity Bridge window.</p>
      )}
      <p className="tiny muted">
        Last capture:{' '}
        {live?.lastCapture?.avatarId === avatarId
          ? new Date(live.lastCapture.at * 1000).toLocaleString()
          : 'Not reported in this session'}{' '}
        · Protocol v1
      </p>
      {pending && <p role="status">Waiting for Unity…</p>}
      {live?.lastResult && (
        <p role="status" className={live.lastResult.ok ? 'muted' : 'notice'}>
          {live.lastResult.message}
        </p>
      )}
      {action.error && <p role="alert">{String(action.error)}</p>}
    </section>
  );
}
