import type { UnityProjectData } from '../../types/unity';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { query, desktop, mockMode } from '../../db/bridge';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
import { ErrorNotice, dateText } from '../../components/common';
interface Project {
  path: string;
  data_json: string;
  last_opened: string | null;
}
export function UnityPanel({ avatarId }: { avatarId: string }) {
  const [search, setSearch] = useState('');
  const [launchNotice, setLaunchNotice] = useState('');
  const project = useQuery({
    queryKey: ['unity-project', avatarId],
    queryFn: async () =>
      (await query<Project>('SELECT * FROM unity_projects WHERE avatar_id=?', avatarId))[0] ?? null,
  });
  const history = useQuery({
    queryKey: ['unity-history', avatarId],
    queryFn: () =>
      query<{ id: string; created_at: string; data_json: string }>(
        'SELECT * FROM unity_dependency_snapshots WHERE avatar_id=? ORDER BY created_at DESC LIMIT 50',
        avatarId,
      ),
  });
  const action = useAction(async (operation: string) => {
    setLaunchNotice('');
    let path: string | undefined;
    if (operation === 'link') {
      const dirs = await invoke<Record<string, { path: string }>>('path_preferences', {
        operation: 'get',
      });
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: dirs.unityProjects.path,
        title: 'Choose a Unity project',
      });
      if (typeof selected !== 'string') return;
      path = selected;
    }
    await invoke('unity_project', { operation, avatarId, path: path ?? null });
    if (operation === 'open')
      setLaunchNotice('VCC accepted the request to open the linked project.');
  });
  const data: UnityProjectData | undefined = project.data
    ? JSON.parse(project.data.data_json)
    : undefined;
  return (
    <section className="panel">
      <div className="row wrap">
        <div>
          <h2>Unity project</h2>
          <p className="muted">Project metadata and dependency history · source: filesystem</p>
        </div>
        <Button
          disabled={action.isPending || !desktop || mockMode}
          onClick={() => action.mutate('link')}
        >
          {data ? 'Change project' : 'Link project'}
        </Button>
      </div>
      {project.error && <ErrorNotice error={project.error} />}
      {action.error && <ErrorNotice error={action.error} />}
      {!data ? (
        <p className="notice">
          Select your project folder containing Assets, Packages and ProjectSettings. Your project
          files stay in place.
        </p>
      ) : (
        <>
          <dl className="definition-grid">
            <dt>Project</dt>
            <dd>{data.name}</dd>
            <dt>Path</dt>
            <dd className="break-all">{project.data?.path}</dd>
            <dt>Unity</dt>
            <dd>{data.unityVersion ?? 'Unknown'}</dd>
            <dt>VRChat SDK Avatars</dt>
            <dd>{data.sdkVersion ?? 'Not detected in manifests'}</dd>
            <dt>Last opened from Vault</dt>
            <dd>{dateText(project.data?.last_opened ?? null)}</dd>
          </dl>
          <div className="row wrap">
            {[
              ['open', 'Open project via VCC'],
              ['folder', 'Open folder'],
              ['scan', 'Rescan project'],
              ['unlink', 'Unlink'],
            ].map(([op, label]) => (
              <Button key={op} disabled={action.isPending} onClick={() => action.mutate(op)}>
                {label}
              </Button>
            ))}
          </div>
          {launchNotice && (
            <p className="notice" role="status">
              {launchNotice}
            </p>
          )}
          <p className="tiny muted">
            VCC opens the registered project using its own editor settings. Add the project in VCC
            first if it is not listed. Unlink keeps dependency history.
          </p>
          {data.warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          <h3>Detected dependencies · {data.packages.length}</h3>
          <input
            aria-label="Search dependencies"
            placeholder="Search packages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Version / reference</th>
                  <th>Type</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {data.packages
                  .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
                  .map((p) => (
                    <tr key={p.name}>
                      <td className="break-all">{p.name}</td>
                      <td className="break-all">{p.version}</td>
                      <td>{p.type}</td>
                      <td>{p.source}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted">
            Manifest declarations and lockfile versions. Assets imported directly into Assets are
            not inferred. No prefab, performance or hierarchy data is invented.
          </p>
        </>
      )}
      <h3>Dependency snapshots</h3>
      <p className="tiny muted">
        Recorded when project metadata changes. No project files are copied and no official
        changelog entry is generated.
      </p>
      {history.error && <ErrorNotice error={history.error} />}
      {history.data?.map((item) => (
        <details key={item.id}>
          <summary>{dateText(item.created_at)}</summary>
          <pre className="json-view">{JSON.stringify(JSON.parse(item.data_json), null, 2)}</pre>
        </details>
      ))}
      {!history.data?.length && <p className="muted">No dependency snapshot yet.</p>}
    </section>
  );
}
