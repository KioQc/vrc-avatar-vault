import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { query, desktop, mockMode } from '../../db/bridge';
import { useAction } from '../../hooks/useVault';
import { studio } from '../../services/studio';
import { Button } from '../../components/ui/button';
import { ErrorNotice, dateText } from '../../components/common';
import { unityProjectSchema } from '../../types/unity';
import type { Change, Release } from '../../types/domain';
import type { ScanData, StudioSnapshot } from '../../types/studio';
import { FileChangesExplorer } from './FileChangesExplorer';
import { DependencyComparison } from './DependencyComparison';
import { compareFileTrees, dependencyDiff, changeLabel } from '../../utils/workflow';
export function ReleasePreparation({
  avatarId,
  snapshots,
  changes,
  releases,
  onNavigate,
  onCreate,
}: {
  avatarId: string;
  snapshots: StudioSnapshot[];
  changes: Change[];
  releases: Release[];
  onNavigate: (tab: string) => void;
  onCreate: () => void;
}) {
  const [scan, setScan] = useState<ScanData | null>(null);
  const [checked, setChecked] = useState(false);
  const project = useQuery({
    queryKey: ['unity-project', avatarId],
    queryFn: async () =>
      (
        await query<{ path: string; data_json: string }>(
          'SELECT * FROM unity_projects WHERE avatar_id=?',
          avatarId,
        )
      )[0] ?? null,
  });
  let metadata = null;
  try {
    const result = unityProjectSchema.safeParse(JSON.parse(project.data?.data_json ?? 'null'));
    if (result.success) metadata = result.data;
  } catch {
    /* Error state shown below. */
  }
  const pending = useQuery({
    queryKey: ['batches', avatarId],
    queryFn: () => studio.batches(avatarId),
  });
  const action = useAction(async (op: string) => {
    if (op === 'check') {
      setChecked(false);
      await invoke('unity_project', { operation: 'scan', avatarId, path: null });
      setScan(await invoke<ScanData>('scan_project', { avatarId }));
      setChecked(true);
    }
    if (op === 'snapshot' && scan)
      await studio.action('snapshot', {
        avatarId,
        kind: 'filesystem',
        label: 'Release preparation · ' + new Date().toLocaleString(),
        releaseId: null,
        baseline: false,
        data: scan,
      });
  });
  const active = desktop && !mockMode && !!project.data && !action.isPending;
  const latest = snapshots.find((s) => s.kind === 'filesystem');
  const unreleased = changes.filter((c) => !c.release_id);
  const review = pending.data?.filter((b) => b.status === 'Review').length ?? 0;
  const releaseSnapshot = snapshots.find(
    (s) => s.kind === 'filesystem' && s.release_id === releases[0]?.id,
  );
  let releaseFiles = null;
  let releasePackages = null;
  if (scan && releaseSnapshot) {
    try {
      const reference = JSON.parse(releaseSnapshot.data_json);
      if (reference.projectPath === scan.projectPath && reference.files) {
        releaseFiles = compareFileTrees(reference.files, scan.files);
        const before = unityProjectSchema.safeParse(reference.projectMetadata);
        const after = unityProjectSchema.safeParse(scan.projectMetadata);
        if (before.success && after.success)
          releasePackages = dependencyDiff(before.data.packages, after.data.packages);
      }
    } catch {
      /* The availability notice below remains visible for invalid snapshots. */
    }
  }
  return (
    <div className="release-preparation">
      <section className="panel">
        <div className="row between wrap">
          <div>
            <p className="eyebrow">RELEASE PREPARATION</p>
            <h2>A clear checkpoint before your next version</h2>
          </div>
          <Button variant="default" onClick={onCreate}>
            Create release…
          </Button>
        </div>
        <p className="muted">
          Review the project and decide what belongs in the changelog. These checks guide you; they
          never publish a release automatically.
        </p>
        <div className="workflow-steps">
          <button onClick={() => onNavigate('Changelog')}>
            <span>Changelog</span>
            <strong>{unreleased.length} unreleased changes</strong>
          </button>
          <button onClick={() => onNavigate('Snapshots')}>
            <span>File review</span>
            <strong>{review} batches to review</strong>
          </button>
          <div>
            <span>Latest project snapshot</span>
            <strong>{latest?.label ?? 'Not saved yet'}</strong>
          </div>
          <div>
            <span>Latest release</span>
            <strong>{releases[0] ? `v${releases[0].version}` : 'Not created yet'}</strong>
          </div>
        </div>
        <section className="panel">
          <h3>Since the latest release{releases[0] ? ` · v${releases[0].version}` : ''}</h3>
          <p className="tiny muted">
            A release-linked project snapshot is the reference. A newer manual baseline does not
            replace it here.
          </p>
          <div className="row wrap">
            <span className="badge">{unreleased.length} changelog drafts</span>
            <span className="badge">{review} work batches to review</span>
            {releasePackages && (
              <span className="badge">{releasePackages.length} dependency changes</span>
            )}
          </div>
          {releaseFiles ? (
            <>
              <div className="row wrap">
                {['Added', 'Modified', 'Removed', 'Renamed'].map((type) => (
                  <span key={type} className={`file-change-status status-${type.toLowerCase()}`}>
                    {type} · {releaseFiles.filter((c) => changeLabel(c.type) === type).length}
                  </span>
                ))}
              </div>
              <FileChangesExplorer
                avatarId={avatarId}
                projectPath={scan?.projectPath}
                changes={releaseFiles}
                title="Files since the latest release"
              />
            </>
          ) : (
            <p className="notice">
              {!scan
                ? 'Check the project to load the current state.'
                : 'No usable project snapshot is linked to the latest release. Save a linked baseline after your next release to enable this comparison.'}
            </p>
          )}
        </section>
        {project.error && <ErrorNotice error={project.error} />}{' '}
        {action.error && <ErrorNotice error={action.error} />}{' '}
        {pending.error && <ErrorNotice error={pending.error} />}
        <div className="row wrap">
          <Button disabled={!active} onClick={() => action.mutate('check')}>
            Check project & compare baseline
          </Button>
          <Button disabled={!active || !scan} onClick={() => action.mutate('snapshot')}>
            Save preparation snapshot
          </Button>
          <Button onClick={() => onNavigate('Unity')}>Project settings</Button>
        </div>
        <ul className="project-health">
          <li>
            {project.data ? '✓ Project linked' : '○ Link a project to enable filesystem checks'}
          </li>
          <li>
            {metadata?.unityVersion
              ? `✓ Unity ${metadata.unityVersion}`
              : '○ Unity version not detected'}
          </li>
          <li>
            {metadata?.sdkVersion
              ? `✓ VRChat SDK ${metadata.sdkVersion}`
              : '○ VRChat SDK not detected in package manifests'}
          </li>
          <li>
            {checked
              ? '✓ Folder accessible and manifests rescanned this session'
              : '○ Check the project to verify its current availability'}
          </li>
          <li>
            {latest
              ? `✓ Snapshot ${dateText(latest.created_at)}`
              : '○ Save a project snapshot before release'}
          </li>
          {metadata?.warnings.map((w) => (
            <li key={w} className="notice">
              {w}
            </li>
          ))}
        </ul>
        {scan && !scan.hasBaseline && (
          <p className="notice">
            No baseline exists yet. The scan lists the current project files; they are not all new
            changes.
          </p>
        )}
        {scan && (
          <FileChangesExplorer
            avatarId={avatarId}
            projectPath={scan.projectPath}
            changes={scan.changes}
            title={scan.hasBaseline ? 'Files changed since baseline' : 'Current project inventory'}
          />
        )}
      </section>
      <DependencyComparison avatarId={avatarId} snapshots={snapshots} />
    </div>
  );
}
