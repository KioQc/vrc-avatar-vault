import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiAvatar, Change, Difference, Release } from '../../types/domain';
import { repository } from '../../db/repository';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { dateText, Badge, Empty } from '../../components/common';
import { compareAvatarSnapshots, groupChangesByCategory } from '../../utils/domain';
import { DiffDialog } from './DiffDialog';
import { useAction } from '../../hooks/useVault';
export function VersionsPanel({
  avatarId,
  releases,
  changes,
}: {
  avatarId: string;
  releases: Release[];
  changes: Change[];
}) {
  const { data: snapshots = [] } = useQuery({
    queryKey: ['snapshots', avatarId],
    queryFn: () => repository.snapshots(avatarId),
  });
  const [raw, setRaw] = useState<ApiAvatar | null>(null),
    [diff, setDiff] = useState<Difference[] | null>(null),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const inspect = useAction(async (id: string) => setRaw(await repository.snapshot(id)));
  const compare = useAction(async (index: number) => {
    const [old, next] = await Promise.all([
      repository.snapshot(snapshots[index + 1].id),
      repository.snapshot(snapshots[index].id),
    ]);
    setDiff(compareAvatarSnapshots(old, next).differences);
  });
  const ordered = [...releases].reverse(),
    a = ordered.findIndex((r) => r.id === from),
    b = ordered.findIndex((r) => r.id === to),
    valid = a >= 0 && b > a;
  const ids = valid ? ordered.slice(a + 1, b + 1).map((r) => r.id) : [];
  const selected = changes.filter((c) => c.release_id && ids.includes(c.release_id));
  return (
    <>
      <section className="panel">
        <h2>Compare releases</h2>
        <p className="muted">
          Includes changes after the first release, through the second release.
        </p>
        <div className="row">
          <select aria-label="From release" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">From…</option>
            {ordered.map((r) => (
              <option key={r.id} value={r.id}>
                v{r.version}
              </option>
            ))}
          </select>
          <span>→</span>
          <select aria-label="To release" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">To…</option>
            {ordered.map((r) => (
              <option key={r.id} value={r.id}>
                v{r.version}
              </option>
            ))}
          </select>
        </div>
        {valid ? (
          <>
            <div className="row wrap">
              {Object.entries(groupChangesByCategory(selected)).map(([cat, list]) => (
                <Badge key={cat}>
                  {list.length} {cat}
                </Badge>
              ))}
            </div>
            {selected.map((c) => (
              <p key={c.id}>{c.title}</p>
            ))}
          </>
        ) : (
          <p className="tiny muted">Choose two releases in chronological order.</p>
        )}
      </section>
      <section className="panel">
        <h2>
          VRChat snapshots <span className="heading-count">{snapshots.length}</span>
        </h2>
        {snapshots.length ? (
          snapshots.map((s, i) => (
            <div className="activity-row" key={s.id}>
              <span className="timeline-dot" />
              <div className="grow">
                <strong>VRChat version {s.vrchat_version}</strong>
                <p className="tiny muted">{dateText(s.created_at)}</p>
              </div>
              <Button size="sm" onClick={() => inspect.mutate(s.id)}>
                View snapshot
              </Button>
              <Button
                size="sm"
                disabled={i === snapshots.length - 1 || compare.isPending}
                onClick={() => compare.mutate(i)}
              >
                Compare with previous
              </Button>
            </div>
          ))
        ) : (
          <Empty
            title="No snapshots"
            description="Import or refresh VRChat data to save a snapshot."
          />
        )}
      </section>
      {diff && (
        <DiffDialog title="Snapshot differences" differences={diff} onClose={() => setDiff(null)} />
      )}
      <Modal
        open={!!raw}
        onOpenChange={(v) => {
          if (!v) setRaw(null);
        }}
        title="Historical snapshot"
        description="Immutable VRChat data captured at this point in time."
        wide
      >
        <pre>{JSON.stringify(raw, null, 2)}</pre>
      </Modal>
    </>
  );
}
