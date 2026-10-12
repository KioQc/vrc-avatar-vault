import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query } from '../../db/bridge';
import { unityProjectSchema } from '../../types/unity';
import { dependencyDiff } from '../../utils/workflow';
import { dateText, ErrorNotice } from '../../components/common';
import type { StudioSnapshot } from '../../types/studio';
export function DependencyComparison({
  avatarId,
  snapshots,
}: {
  avatarId: string;
  snapshots: StudioSnapshot[];
}) {
  const [selected, setSelected] = useState('baseline');
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
  const history = useQuery({
    queryKey: ['unity-history', avatarId],
    queryFn: () =>
      query<{ id: string; created_at: string; data_json: string }>(
        'SELECT * FROM unity_dependency_snapshots WHERE avatar_id=? ORDER BY created_at DESC LIMIT 50',
        avatarId,
      ),
  });
  const watch = useQuery({
    queryKey: ['watch', avatarId],
    queryFn: async () =>
      (
        await query<{ baseline_id: string | null }>(
          'SELECT * FROM project_watch WHERE avatar_id=?',
          avatarId,
        )
      )[0] ?? null,
  });
  const baseline = snapshots.find((s) => s.id === watch.data?.baseline_id);
  function parse(value: string | undefined, key?: string) {
    try {
      const data = JSON.parse(value ?? 'null');
      if (key && (data?.projectPath ?? data?.path) !== project.data?.path) return null;
      const parsed = unityProjectSchema.safeParse(key ? data?.[key] : data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  const current = parse(project.data?.data_json);
  const before =
    selected === 'baseline'
      ? parse(baseline?.data_json, 'projectMetadata')
      : parse(history.data?.find((h) => h.id === selected)?.data_json, 'project');
  const diff = current && before ? dependencyDiff(before.packages, current.packages) : [];
  return (
    <section className="panel dependency-review">
      <div className="row between wrap">
        <div>
          <p className="eyebrow">DEPENDENCY TRACKER</p>
          <h2>What changed in your packages?</h2>
        </div>
        <span className="badge">{diff.length} differences</span>
      </div>
      <p className="muted">
        Compare the current detected manifests with a saved baseline or dependency snapshot. Rescan
        the project to refresh the current side.
      </p>
      {[project.error, history.error, watch.error].filter(Boolean).map((error, i) => (
        <ErrorNotice key={i} error={error} />
      ))}
      <label className="dependency-baseline">
        Compare against
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="baseline">Project baseline {baseline ? `· ${baseline.label}` : ''}</option>
          {history.data?.map((h) => (
            <option key={h.id} value={h.id}>
              Dependency snapshot · {dateText(h.created_at)}
            </option>
          ))}
        </select>
      </label>
      {!before && (
        <p className="notice">
          {selected === 'baseline'
            ? 'This baseline has no saved package metadata. Create a new baseline with this preview, or select a dependency snapshot above.'
            : 'No valid reference snapshot selected.'}
        </p>
      )}
      {!current && (
        <p className="notice">Link and rescan a Unity project to detect its packages.</p>
      )}
      {before && current && !diff.length && (
        <p className="notice">
          No dependency version or source changes detected against this reference.
        </p>
      )}
      {diff.map((d) => (
        <div className="dependency-diff-row" key={d.name}>
          <span className={`file-change-status status-${d.type.toLowerCase()}`}>{d.type}</span>
          <div>
            <strong>{d.name}</strong>
            <p className="tiny muted">
              {d.before?.version ?? 'Not present'} → {d.after?.version ?? 'Removed'} ·{' '}
              {d.after?.type ?? d.before?.type}
            </p>
            {d.before?.version === d.after?.version && (
              <small className="muted">Source or location changed</small>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
