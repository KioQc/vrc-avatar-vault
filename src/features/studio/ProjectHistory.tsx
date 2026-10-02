import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { query, desktop, mockMode } from '../../db/bridge';
import { studio } from '../../services/studio';
import { readText, saveText } from '../../services/files';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
import { ErrorNotice } from '../../components/common';
import { suggestions, structuredDiff } from '../../utils/studio';
import type { FileChange, ScanData, StudioSnapshot } from '../../types/studio';
export function ProjectHistory({
  avatarId,
  snapshots,
}: {
  avatarId: string;
  snapshots: StudioSnapshot[];
}) {
  const [scan, setScan] = useState<ScanData | null>(null),
    [label, setLabel] = useState(''),
    [releaseId, setReleaseId] = useState(''),
    [baseline, setBaseline] = useState(false),
    [compareA, setCompareA] = useState(''),
    [compareB, setCompareB] = useState('');
  const watch = useQuery({
    queryKey: ['watch', avatarId],
    queryFn: async () =>
      (
        await query<{
          enabled: number;
          baseline_id: string | null;
          last_scan: string | null;
          error: string | null;
        }>('SELECT * FROM project_watch WHERE avatar_id=?', avatarId)
      )[0] ?? null,
    refetchInterval: 5000,
  });
  const batches = useQuery({
    queryKey: ['batches', avatarId],
    queryFn: () => studio.batches(avatarId),
    refetchInterval: 5000,
  });
  const releases = useQuery({
    queryKey: ['release-options', avatarId],
    queryFn: () =>
      query<{ id: string; version: string }>(
        'SELECT id,version FROM releases WHERE avatar_id=? ORDER BY released_at DESC',
        avatarId,
      ),
  });
  const action = useAction(async (op: string) => {
    if (op === 'scan') setScan(await invoke<ScanData>('scan_project', { avatarId }));
    else if (op === 'save' && scan)
      await studio.action('snapshot', {
        avatarId,
        kind: 'filesystem',
        label: label || 'Project snapshot',
        releaseId: releaseId || null,
        baseline,
        data: scan,
      });
    else if (op === 'import') {
      const text = await readText();
      if (text)
        await studio.importTechnical(
          avatarId,
          JSON.parse(text),
          label || 'Unity snapshot',
          releaseId || null,
        );
    } else if (op === 'watch')
      await studio.action('watch', { avatarId, enabled: !watch.data?.enabled });
  });
  const review = useAction(
    async ({ id, title, description }: { id: string; title?: string; description?: string }) => {
      if (title) await studio.acceptSuggestion(avatarId, title, description ?? '');
      else await studio.action('batch_ignore', { id });
    },
  );
  const manage = useAction(
    async ({ operation, id, label }: { operation: string; id: string; label?: string }) =>
      studio.action(operation, { id, avatarId, label }),
  );
  const files = snapshots.filter((s) => s.kind === 'filesystem');
  const a = files.find((s) => s.id === compareA),
    b = files.find((s) => s.id === compareB);
  const diffs =
    a && b ? structuredDiff(JSON.parse(a.data_json).files, JSON.parse(b.data_json).files) : [];
  return (
    <section className="panel">
      <h2>Project changes & snapshots</h2>
      <p className="muted">
        Optional polling every 5 seconds, two stable scans before grouping changes. Active while
        Vault is open; ignores Unity caches and linked directories. No official changelog is created
        automatically.
      </p>
      <div className="row wrap">
        <Button
          disabled={!desktop || mockMode || action.isPending}
          onClick={() => action.mutate('watch')}
        >
          {watch.data?.enabled ? 'Stop watching' : 'Watch project'}
        </Button>
        <Button
          disabled={!desktop || mockMode || action.isPending}
          onClick={() => action.mutate('scan')}
        >
          Scan now / compare baseline
        </Button>
        <Button disabled={action.isPending} onClick={() => action.mutate('import')}>
          Import Unity snapshot JSON
        </Button>
      </div>
      <p className="tiny muted">
        Last scan: {watch.data?.last_scan ?? 'Not scanned'} · Baseline:{' '}
        {snapshots.find((s) => s.id === watch.data?.baseline_id)?.label ?? 'None'}
      </p>
      {watch.data?.error && <p role="alert">{watch.data.error}</p>}
      {watch.error && <ErrorNotice error={watch.error} />}
      <div className="form-grid">
        <label>
          Snapshot label
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          Link release
          <select value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>
            <option value="">No release</option>
            {releases.data?.map((r) => (
              <option value={r.id} key={r.id}>
                v{r.version}
              </option>
            ))}
          </select>
        </label>
      </div>
      {scan && (
        <>
          <h3>
            {Object.keys(scan.files).length} tracked files · {scan.changes.length} differences{' '}
            {scan.hasBaseline ? 'from baseline' : '(no baseline yet)'}
          </h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={baseline}
              onChange={(e) => setBaseline(e.target.checked)}
            />
            Use as new baseline
          </label>
          <Button disabled={action.isPending} onClick={() => action.mutate('save')}>
            Save metadata snapshot
          </Button>
          <details>
            <summary>Review files</summary>
            {scan.changes.slice(0, 500).map((c) => (
              <p key={c.path}>
                {c.type} · {c.oldPath ? `${c.oldPath} → ` : ''}
                {c.path}
              </p>
            ))}
          </details>
        </>
      )}
      <h3>Development sessions to review</h3>
      {batches.data
        ?.filter((b) => b.status === 'Review')
        .map((batch) => {
          const changes = (JSON.parse(batch.data_json).changes ?? []) as FileChange[];
          return (
            <details key={batch.id} open>
              <summary>
                {changes.length} files · {batch.started_at} → {batch.updated_at}
              </summary>
              <div className="row wrap">
                {Object.entries(
                  changes.reduce<Record<string, number>>((g, c) => {
                    g[c.kind] = (g[c.kind] ?? 0) + 1;
                    return g;
                  }, {}),
                ).map(([k, v]) => (
                  <span className="badge" key={k}>
                    {k}: {v}
                  </span>
                ))}
              </div>
              <details>
                <summary>File list</summary>
                {changes.slice(0, 500).map((c) => (
                  <p key={c.path}>
                    {c.type} · {c.path}
                  </p>
                ))}
              </details>
              {suggestions(changes).map((s) => (
                <div className="notice" key={s.title}>
                  <strong>{s.title}</strong>
                  <p>
                    Suggested because:{' '}
                    {s.evidence
                      .slice(0, 8)
                      .map((e) => e.path)
                      .join(', ')}
                  </p>
                  <Button
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        id: batch.id,
                        title: s.title,
                        description: s.evidence.map((e) => `${e.type}: ${e.path}`).join('\n'),
                      })
                    }
                  >
                    Accept into unreleased changelog
                  </Button>
                </div>
              ))}
              <Button disabled={review.isPending} onClick={() => review.mutate({ id: batch.id })}>
                Dismiss reviewed session
              </Button>
            </details>
          );
        })}
      <h3>Saved snapshots</h3>
      {snapshots.map((s) => (
        <details key={s.id}>
          <summary>
            {s.label} · {s.kind} · {s.platform} · {s.created_at}
          </summary>
          <div className="row wrap">
            <input
              aria-label={`Rename ${s.label}`}
              defaultValue={s.label}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== s.label)
                  manage.mutate({ operation: 'snapshot_rename', id: s.id, label: e.target.value });
              }}
            />
            {s.kind === 'filesystem' && (
              <Button onClick={() => manage.mutate({ operation: 'baseline', id: s.id })}>
                Set baseline
              </Button>
            )}
            <Button
              onClick={() =>
                void saveText(`${s.label.replace(/[^a-z0-9-]/gi, '_')}.json`, s.data_json)
              }
            >
              Export JSON
            </Button>
            <Button
              onClick={() => {
                if (window.confirm('Delete this local snapshot? Project files are not affected.'))
                  manage.mutate({ operation: 'snapshot_delete', id: s.id });
              }}
            >
              Delete snapshot
            </Button>
          </div>
        </details>
      ))}
      <h3>Compare filesystem snapshots</h3>
      <div className="row">
        <select
          aria-label="Earlier filesystem snapshot"
          value={compareA}
          onChange={(e) => setCompareA(e.target.value)}
        >
          <option value="">Earlier</option>
          {files.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Later filesystem snapshot"
          value={compareB}
          onChange={(e) => setCompareB(e.target.value)}
        >
          <option value="">Later</option>
          {files.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {diffs.slice(0, 300).map((d, i) => (
        <p key={i}>
          <strong>{d.kind}</strong> {d.path}: {JSON.stringify(d.before)} → {JSON.stringify(d.after)}
        </p>
      ))}
    </section>
  );
}
