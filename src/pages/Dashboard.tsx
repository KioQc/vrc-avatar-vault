import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ArrowUpRight, CircleAlert } from 'lucide-react';
import { useAvatars, useSettings } from '../hooks/useVault';
import { query } from '../db/bridge';
import { repository } from '../db/repository';
import { useWorkspace } from '../components/workspace';
import { useUI } from '../stores/ui';
import { AvatarImage, Empty, ErrorNotice, Loading, timeAgo } from '../components/common';
import { Button } from '../components/ui/button';
import { durationText } from '../utils/studio';
export function Dashboard() {
  const { data: settings } = useSettings();
  const { data: avatars = [], isLoading, error } = useAvatars();
  const { data: workspace } = useWorkspace();
  const setImport = useUI((s) => s.setImport);
  const data = useQuery({
    queryKey: ['overview-feed'],
    queryFn: async () => ({
      activity: await repository.activity(),
      releases: await query<{
        id: string;
        avatar_id: string;
        version: string;
        title: string;
        released_at: string;
      }>('SELECT * FROM releases ORDER BY released_at DESC LIMIT 6'),
      week: await query<{ seconds: number }>(
        "SELECT coalesce(sum(duration_seconds),0) seconds FROM work_sessions WHERE started_at>=datetime('now','-7 days')",
      ),
    }),
  });
  if (isLoading) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  const active = avatars
    .filter((a) => !a.archived)
    .sort((a, b) => Number(b.id === settings?.lastAvatar) - Number(a.id === settings?.lastAvatar));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE</div>
          <h1>Overview</h1>
          <p>Pick up where you left off.</p>
        </div>
        <Button onClick={() => setImport(true)}>
          <Plus size={15} />
          Import avatar
        </Button>
      </div>
      <div className="overview-metrics">
        {[
          ['Avatars', active.length],
          ['Open bugs', workspace?.avatars.reduce((n, a) => n + a.bugs, 0) ?? 0],
          ['Unreleased changes', workspace?.avatars.reduce((n, a) => n + a.changes, 0) ?? 0],
          ['Work · last 7 days', durationText(data.data?.week[0]?.seconds ?? 0)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="workspace-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>Continue working</h2>
            <Link to="/avatars">
              Library <ArrowUpRight size={13} />
            </Link>
          </div>
          {!active.length && (
            <Empty
              title="No avatars yet"
              description="Import an avatar to track its development."
              action={<Button onClick={() => setImport(true)}>Import avatar</Button>}
            />
          )}{' '}
          {active.slice(0, 6).map((a) => {
            const info = workspace?.avatars.find((v) => v.id === a.id);
            return (
              <Link className="continue-row" key={a.id} to={`/avatars/${a.id}`}>
                <AvatarImage name={a.name} src={a.data.thumbnailImageUrl} />
                <div className="grow">
                  <strong>{a.name}</strong>
                  <small>
                    v{a.custom_version} · {info?.changes ?? 0} unreleased · {info?.bugs ?? 0} bugs
                  </small>
                </div>
                <span className="muted">{timeAgo(a.updated_at)}</span>
                <ArrowUpRight size={15} />
              </Link>
            );
          })}
        </section>
        <section className="panel attention-panel">
          <div className="section-heading">
            <h2>Needs attention</h2>
            <CircleAlert size={16} />
          </div>
          {workspace?.avatars
            .filter((a) => a.bugs || a.files || a.tasks)
            .slice(0, 8)
            .map((a) => (
              <Link
                key={a.id}
                className="attention-row"
                to={`/avatars/${a.id}?tab=${a.bugs ? 'Bugs' : a.files ? 'Snapshots' : 'Notes'}`}
              >
                <span className="attention-dot" />
                <div>
                  <strong>
                    {a.bugs
                      ? `${a.bugs} open bugs`
                      : a.files
                        ? `${a.files} project changes to review`
                        : `${a.tasks} unfinished tasks`}
                  </strong>
                  <small>{avatars.find((v) => v.id === a.id)?.name}</small>
                </div>
                <ArrowUpRight size={13} />
              </Link>
            ))}
          {!workspace?.avatars.some((a) => a.bugs || a.files || a.tasks) && (
            <p className="muted">No open bugs, pending file reviews or tasks.</p>
          )}
          {workspace?.work.map((w) => (
            <Link className="attention-row" key={w.id} to={`/avatars/${w.avatar_id}?tab=Work`}>
              <span className="status-dot" data-active={w.status === 'Running'} />
              <div>
                <strong>
                  {w.status} session · {durationText(w.duration_seconds)}
                </strong>
                <small>
                  {w.name} · {w.description}
                </small>
              </div>
            </Link>
          ))}
        </section>
        <section className="panel">
          <h2>Recent activity</h2>
          {data.data?.activity.slice(0, 8).map((a) => (
            <Link
              className="feed-line"
              key={a.id}
              to={a.avatar_id ? `/avatars/${a.avatar_id}` : '/activity'}
            >
              <span className="muted">{timeAgo(a.created_at)}</span>
              <span>{a.message}</span>
            </Link>
          ))}
          {!data.data?.activity.length && (
            <p className="muted">Your project activity will appear here.</p>
          )}
        </section>
        <section className="panel">
          <h2>Recent releases</h2>
          {data.data?.releases.map((r) => (
            <Link className="feed-line" key={r.id} to={`/avatars/${r.avatar_id}?tab=Changelog`}>
              <strong>v{r.version}</strong>
              <span>
                {r.title}
                <small>{timeAgo(r.released_at)}</small>
              </span>
            </Link>
          ))}
          {!data.data?.releases.length && (
            <p className="muted">Create a release when your changes are ready.</p>
          )}
        </section>
      </div>
    </>
  );
}
