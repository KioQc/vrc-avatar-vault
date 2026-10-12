import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { query, desktop, mockMode } from '../../db/bridge';
import { useAction } from '../../hooks/useVault';
import { studio } from '../../services/studio';
import { Button } from '../../components/ui/button';
import { ErrorNotice, dateText } from '../../components/common';
import type { ScanData, StudioSnapshot } from '../../types/studio';
import { BridgeStatus } from './BridgeStatus';

interface WorkflowState {
  path: string | null;
  enabled: number | null;
  baseline_id: string | null;
  last_scan: string | null;
  error: string | null;
  pending: number;
  dependencies: number;
}
export function UnityWorkflow({
  avatarId,
  snapshots,
  onNavigate,
}: {
  avatarId: string;
  snapshots: StudioSnapshot[];
  onNavigate: (tab: string) => void;
}) {
  const state = useQuery({
    queryKey: ['unity-workflow', avatarId],
    refetchInterval: 5000,
    queryFn: async () =>
      (
        await query<WorkflowState>(
          `SELECT u.path,w.enabled,w.baseline_id,w.last_scan,w.error,(SELECT count(*) FROM development_batches d WHERE d.avatar_id=u.avatar_id AND d.status='Review') pending,(SELECT count(*) FROM manual_dependencies m WHERE m.avatar_id=u.avatar_id) dependencies FROM unity_projects u LEFT JOIN project_watch w ON w.avatar_id=u.avatar_id WHERE u.avatar_id=?`,
          avatarId,
        )
      )[0] ?? null,
  });
  const action = useAction(async (op: string) => {
    if (op === 'watch') await studio.action('watch', { avatarId, enabled: !state.data?.enabled });
    if (op === 'snapshot' || op === 'baseline') {
      const scan = await invoke<ScanData>('scan_project', { avatarId });
      await studio.action('snapshot', {
        avatarId,
        kind: 'filesystem',
        label: `${op === 'baseline' ? 'Baseline' : 'Project snapshot'} · ${new Date().toLocaleString()}`,
        releaseId: null,
        baseline: op === 'baseline',
        data: scan,
      });
    }
  }, 'Unity workflow updated');
  const baseline = snapshots.find((s) => s.id === state.data?.baseline_id);
  const filesystem = snapshots.filter((s) => s.kind === 'filesystem');
  const ready = desktop && !mockMode && !!state.data?.path && !action.isPending;
  return (
    <section className="panel unity-workflow">
      <BridgeStatus avatarId={avatarId} />
      <div className="row between wrap">
        <div>
          <p className="eyebrow">UNITY WORKFLOW · 0.9.0 PREVIEW</p>
          <h2>Avatar → Project → Changes → Snapshot → Release</h2>
        </div>
        <img src="/branding/vav-symbol.png" className="workflow-logo" alt="" />
      </div>
      <p className="muted">
        A local workflow for your linked VCC project. Review detected changes before adding them to
        a release.
      </p>
      {state.error && <ErrorNotice error={state.error} />}
      {action.error && <ErrorNotice error={action.error} />}
      <div className="workflow-steps">
        <div>
          <span>01 · Project</span>
          <strong>{state.data?.path ? 'Linked via VCC' : 'Link your project below'}</strong>
        </div>
        <button onClick={() => onNavigate('Snapshots')}>
          <span>02 · Changes</span>
          <strong>{state.data?.pending ?? 0} batches to review</strong>
        </button>
        <button onClick={() => onNavigate('Snapshots')}>
          <span>03 · Snapshots</span>
          <strong>{filesystem.length} filesystem snapshots</strong>
        </button>
        <button onClick={() => onNavigate('Prepare release')}>
          <span>04 · Release</span>
          <strong>Prepare next release</strong>
        </button>
      </div>
      <dl className="definition-grid">
        <dt>Watcher</dt>
        <dd>
          {state.isPending
            ? 'Loading…'
            : state.data?.enabled
              ? 'Watching while VAV is open'
              : 'Stopped'}
        </dd>
        <dt>Last scan</dt>
        <dd>{state.data?.last_scan ? dateText(state.data.last_scan) : 'Not scanned'}</dd>
        <dt>Baseline</dt>
        <dd>{baseline?.label ?? (state.data?.baseline_id ? 'Saved baseline' : 'Not set')}</dd>
      </dl>
      {state.data?.error && (
        <p className="notice" role="alert">
          {state.data.error}
        </p>
      )}
      <div className="row wrap">
        <Button disabled={!ready} onClick={() => action.mutate('watch')}>
          {state.data?.enabled ? 'Stop watcher' : 'Start watcher'}
        </Button>
        <Button disabled={!ready} onClick={() => action.mutate('snapshot')}>
          Create project snapshot
        </Button>
        <Button disabled={!ready} onClick={() => action.mutate('baseline')}>
          Use current project as baseline
        </Button>
        <Button onClick={() => onNavigate('Dependencies')}>
          Dependencies · {state.data?.dependencies ?? 0} manual
        </Button>
        <Button onClick={() => onNavigate('Snapshots')}>Review files & compare</Button>
        <Button onClick={() => onNavigate('Prepare release')}>Prepare release</Button>
      </div>
      <p className="tiny muted">
        Snapshots record file metadata and hashes. They do not copy the whole project or modify your
        Unity assets. Baseline changes require a deliberate click.
      </p>
    </section>
  );
}
