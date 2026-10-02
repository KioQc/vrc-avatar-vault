import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query, execute, statement } from '../../db/bridge';
import { repository } from '../../db/repository';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
import { ErrorNotice } from '../../components/common';
export function UploadLinks({ avatarId }: { avatarId: string }) {
  const [releaseId, setRelease] = useState(''),
    [snapshotId, setSnapshot] = useState('');
  const data = useQuery({
    queryKey: ['upload-links', avatarId],
    queryFn: async () => ({
      releases: await repository.releases(avatarId),
      snapshots: await repository.snapshots(avatarId),
      links: await query<{ release_id: string; api_after: number; association: string }>(
        'SELECT * FROM release_links WHERE avatar_id=?',
        avatarId,
      ),
    }),
  });
  const save = useAction(async () => {
    await execute([
      statement(
        `UPDATE release_links SET api_after=(SELECT vrchat_version FROM avatar_snapshots WHERE id=? AND avatar_id=?),upload_snapshot_id=?,association='confirmed' WHERE release_id=? AND avatar_id=? AND EXISTS(SELECT 1 FROM avatar_snapshots WHERE id=? AND avatar_id=?)`,
        snapshotId,
        avatarId,
        snapshotId,
        releaseId,
        avatarId,
        snapshotId,
        avatarId,
      ),
    ]);
  }, 'Upload association saved');
  return (
    <section className="panel">
      <h2>Release / VRChat upload association</h2>
      <p className="muted">
        Select the observed API version that corresponds to your local release. Refresh VRChat first
        after uploading. A release alone does not upload an avatar.
      </p>
      {data.error && <ErrorNotice error={data.error} />}
      <div className="row">
        <select
          aria-label="Release to associate"
          value={releaseId}
          onChange={(e) => setRelease(e.target.value)}
        >
          <option value="">Choose release</option>
          {data.data?.releases.map((r) => (
            <option key={r.id} value={r.id}>
              v{r.version} — {r.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Observed VRChat upload"
          value={snapshotId}
          onChange={(e) => setSnapshot(e.target.value)}
        >
          <option value="">Choose observed API version</option>
          {data.data?.snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              VRChat v{s.vrchat_version} — {new Date(s.created_at).toLocaleString()}
            </option>
          ))}
        </select>
        <Button
          disabled={!releaseId || !snapshotId || save.isPending}
          onClick={() => save.mutate()}
        >
          Confirm association
        </Button>
      </div>
      {data.data?.links
        .filter((l) => l.association === 'confirmed')
        .map((l) => (
          <p key={l.release_id}>
            Release v{data.data?.releases.find((r) => r.id === l.release_id)?.version} → VRChat v
            {l.api_after}
          </p>
        ))}
    </section>
  );
}
