import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAvatars } from '../hooks/useVault';
import { query } from '../db/bridge';
import { Empty, ErrorNotice, timeAgo } from '../components/common';
import { WorkPanel } from '../features/studio/WorkPanel';
import { ProjectHistory } from '../features/studio/ProjectHistory';
import { DependenciesPanel } from '../features/studio/DependenciesPanel';
import { studio } from '../services/studio';
export function WorkspaceTools() {
  const { tool } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: avatars = [] } = useAvatars();
  const avatar =
    avatars.find((a) => a.id === params.get('avatar')) ??
    avatars.find((a) => !a.archived) ??
    avatars[0];
  const data = useQuery({
    queryKey: ['global-bugs'],
    queryFn: () =>
      query<{
        id: string;
        avatar_id: string;
        title: string;
        status: string;
        severity: string;
        found_version: string;
        updated_at: string;
        name: string;
      }>(
        'SELECT b.*,a.name FROM bugs b JOIN avatars a ON a.id=b.avatar_id ORDER BY b.updated_at DESC',
      ),
  });
  const snapshots = useQuery({
    queryKey: ['studio-snapshots', avatar?.id],
    queryFn: () => studio.snapshots(avatar!.id),
    enabled: !!avatar,
  });
  const titles: Record<string, string> = {
    bugs: 'Bugs',
    work: 'Work sessions',
    snapshots: 'Snapshots',
    dependencies: 'Dependencies',
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE TOOLS</div>
          <h1>{titles[tool ?? ''] ?? 'Projects'}</h1>
        </div>
        {tool !== 'bugs' && (
          <select
            aria-label="Selected project"
            value={avatar?.id ?? ''}
            onChange={(e) => setParams({ avatar: e.target.value })}
          >
            {avatars.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!avatar ? (
        <Empty title="No project yet" description="Import an avatar from the Library to start." />
      ) : tool === 'bugs' ? (
        <>
          <input
            placeholder="Search bugs…"
            aria-label="Search all bugs"
            value={params.get('q') ?? ''}
            onChange={(e) => setParams({ q: e.target.value })}
          />
          {data.error && <ErrorNotice error={data.error} />}
          <div className="table-scroll panel">
            <table>
              <thead>
                <tr>
                  {['Issue', 'Avatar', 'Status', 'Severity', 'Version', 'Updated'].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data
                  ?.filter((b) =>
                    `${b.title} ${b.name}`
                      .toLowerCase()
                      .includes((params.get('q') ?? '').toLowerCase()),
                  )
                  .map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link to={`/avatars/${b.avatar_id}?tab=Bugs&bug=${b.id}`}>{b.title}</Link>
                      </td>
                      <td>{b.name}</td>
                      <td>{b.status}</td>
                      <td>{b.severity}</td>
                      <td>{b.found_version}</td>
                      <td>{timeAgo(b.updated_at)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data.data?.length && (
              <Empty
                title="No bugs recorded"
                description="Report bugs from an avatar’s Bugs tab."
              />
            )}
          </div>
        </>
      ) : tool === 'work' ? (
        <WorkPanel key={avatar.id} avatarId={avatar.id} />
      ) : tool === 'dependencies' ? (
        <DependenciesPanel key={avatar.id} avatarId={avatar.id} />
      ) : (
        <ProjectHistory key={avatar.id} avatarId={avatar.id} snapshots={snapshots.data ?? []} />
      )}
    </>
  );
}
