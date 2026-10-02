import { useAction } from '../../hooks/useVault';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repository } from '../../db/repository';
import type { StudioSnapshot } from '../../types/studio';
import { Modal } from '../../components/ui/dialog';
import { CopyButton, dateText } from '../../components/common';
export function SnapshotTimeline({
  avatarId,
  snapshots,
}: {
  avatarId: string;
  snapshots: StudioSnapshot[];
}) {
  const { data } = useQuery({
    queryKey: ['snapshot-timeline', avatarId],
    queryFn: async () => ({
      api: await repository.snapshots(avatarId),
      releases: await repository.releases(avatarId),
    }),
  });
  const [selected, setSelected] = useState<{
    id: string;
    label: string;
    at: string;
    kind: string;
    detail: string;
  } | null>(null);
  const inspect = useAction(async (event: NonNullable<typeof selected>) => {
    if (event.kind === 'VRChat snapshot')
      event = { ...event, detail: JSON.stringify(await repository.snapshot(event.id), null, 2) };
    setSelected(event);
  });
  const events = [
    ...snapshots.map((s) => ({
      id: s.id,
      label: s.label,
      at: s.created_at,
      kind: s.kind === 'technical' ? 'Unity snapshot' : 'Project baseline',
      detail: s.data_json,
    })),
    ...(data?.api ?? []).map((s) => ({
      id: s.id,
      label: `API v${s.vrchat_version}`,
      at: s.created_at,
      kind: 'VRChat snapshot',
      detail: s.snapshot_json ?? '{}',
    })),
    ...(data?.releases ?? []).map((r) => ({
      id: r.id,
      label: `v${r.version} · ${r.title}`,
      at: r.released_at,
      kind: 'Release',
      detail: JSON.stringify(r, null, 2),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <section className="panel">
      <h2>Snapshot timeline</h2>
      <p className="tiny muted">Unity captures, observed VRChat versions and local releases.</p>
      <div className="snapshot-timeline">
        {events.map((e, i) => (
          <div key={e.id}>
            {(!i || events[i - 1].at.slice(0, 10) !== e.at.slice(0, 10)) && (
              <h4>{dateText(e.at).split(' · ')[0]}</h4>
            )}
            <button className="snapshot-line" onClick={() => inspect.mutate(e)}>
              <span className="timeline-dot" />
              <span className="muted">
                {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <strong>{e.kind}</strong>
              <span>{e.label}</span>
            </button>
          </div>
        ))}
      </div>
      {!events.length && (
        <p className="empty-inline">Capture your first snapshot to establish a baseline.</p>
      )}
      <Modal
        drawer
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
        title={selected?.label ?? 'Snapshot'}
        description={selected ? `${selected.kind} · ${dateText(selected.at)}` : ''}
      >
        <CopyButton text={selected?.detail ?? ''} label="Copy snapshot JSON" />
        <details>
          <summary>Technical details / raw JSON</summary>
          <pre>{selected?.detail ? JSON.stringify(JSON.parse(selected.detail), null, 2) : ''}</pre>
        </details>
      </Modal>
    </section>
  );
}
