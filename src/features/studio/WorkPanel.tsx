import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query } from '../../db/bridge';
import { studio } from '../../services/studio';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
import { ErrorNotice } from '../../components/common';
import { durationText } from '../../utils/studio';
export function WorkPanel({ avatarId }: { avatarId: string }) {
  const [description, setDescription] = useState('');
  const sessions = useQuery({
    queryKey: ['work', avatarId],
    queryFn: () => studio.sessions(avatarId),
    refetchInterval: 5000,
  });
  const stats = useQuery({
    queryKey: ['studio-stats', avatarId],
    queryFn: async () => {
      const [counts] = await query<Record<string, number>>(
        `SELECT (SELECT count(*) FROM releases WHERE avatar_id=?) releases,(SELECT count(*) FROM changelog_entries WHERE avatar_id=?) changes,(SELECT count(*) FROM bugs WHERE avatar_id=? AND status='Fixed') fixedBugs,(SELECT count(*) FROM bugs WHERE avatar_id=? AND status NOT IN ('Fixed', 'Duplicate', 'Won''t Fix')) openBugs,(SELECT count(*) FROM studio_snapshots WHERE avatar_id=?) snapshots,(SELECT count(DISTINCT vrchat_version) FROM avatar_snapshots WHERE avatar_id=?) uploads`,
        ...Array(6).fill(avatarId),
      );
      const categories = await query<{ category: string; count: number }>(
        `SELECT c.category_id category,count(*) count FROM changelog_entry_categories c JOIN changelog_entries e ON e.id=c.entry_id WHERE e.avatar_id=? GROUP BY c.category_id ORDER BY count DESC`,
        avatarId,
      );
      const months = await query<{ month: string; count: number }>(
        `SELECT substr(created_at,1,7) month,count(*) count FROM changelog_entries WHERE avatar_id=? GROUP BY month ORDER BY count DESC LIMIT 1`,
        avatarId,
      );
      const releaseDates = await query<{ released_at: string }>(
        'SELECT released_at FROM releases WHERE avatar_id=? ORDER BY released_at',
        avatarId,
      );
      const interval =
        releaseDates.length > 1
          ? (Date.parse(releaseDates.at(-1)!.released_at) -
              Date.parse(releaseDates[0].released_at)) /
            (releaseDates.length - 1) /
            86400000
          : null;
      return { counts, categories, month: months[0], interval };
    },
    refetchInterval: 15000,
  });
  const action = useAction(async ({ operation, id }: { operation: string; id?: string }) => {
    await studio.action(operation, { avatarId, id, description });
  });
  const total = sessions.data?.reduce((n, s) => n + s.duration_seconds, 0) ?? 0;
  return (
    <section className="panel">
      <h2>Work sessions</h2>
      <p className="muted">
        Time is recorded by the desktop app every 5 seconds. After a restart, interrupted sessions
        require Resume, End at last heartbeat or Discard. Long computer sleep is not counted.
      </p>
      <div className="row">
        <input
          aria-label="Work session description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What are you working on?"
        />
        <Button
          disabled={action.isPending}
          onClick={() => action.mutate({ operation: 'session_start' })}
        >
          Start session
        </Button>
      </div>
      {sessions.error && <ErrorNotice error={sessions.error} />}
      {sessions.data?.map((s) => (
        <div className="settings-row" key={s.id}>
          <div>
            <strong>
              {s.description || 'Work session'} · {s.status}
            </strong>
            <p>
              v{s.version} · {s.started_at} → {s.ended_at ?? s.heartbeat_at}
            </p>
            <strong>{durationText(s.duration_seconds)}</strong>
          </div>
          <div className="row wrap">
            {s.status === 'Running' && (
              <Button onClick={() => action.mutate({ operation: 'session_pause', id: s.id })}>
                Pause
              </Button>
            )}
            {['Paused', 'Interrupted'].includes(s.status) && (
              <Button onClick={() => action.mutate({ operation: 'session_resume', id: s.id })}>
                Resume
              </Button>
            )}
            {s.status !== 'Stopped' && (
              <Button onClick={() => action.mutate({ operation: 'session_stop', id: s.id })}>
                {s.status === 'Interrupted' ? 'End at last heartbeat' : 'Stop'}
              </Button>
            )}
            {s.status === 'Interrupted' && (
              <Button
                onClick={() => {
                  if (window.confirm('Discard this interrupted work session?'))
                    action.mutate({ operation: 'session_discard', id: s.id });
                }}
              >
                Discard
              </Button>
            )}
          </div>
        </div>
      ))}
      <h2>Statistics</h2>
      <p className="tiny muted">
        Informational counts, not quality scores. Time totals below cover the latest 500 sessions.
      </p>
      <div className="stats-grid">
        {Object.entries(stats.data?.counts ?? {}).map(([key, v]) => (
          <div className="stat-card" key={key}>
            <span>{key}</span>
            <strong>{v}</strong>
          </div>
        ))}
        <div className="stat-card">
          <span>Total work time</span>
          <strong>{durationText(total)}</strong>
        </div>
        <div className="stat-card">
          <span>Longest session</span>
          <strong>
            {durationText(Math.max(0, ...(sessions.data ?? []).map((s) => s.duration_seconds)))}
          </strong>
        </div>
      </div>
      <p>
        Most active month: {stats.data?.month?.month ?? 'Unknown'} · Most modified category:{' '}
        {stats.data?.categories[0]?.category ?? 'Unknown'}
      </p>
      <p>
        Average release interval: {stats.data?.interval?.toFixed(1) ?? 'Unknown'} days · Changes per
        release:{' '}
        {stats.data?.counts.releases
          ? ((stats.data.counts.changes ?? 0) / stats.data.counts.releases).toFixed(1)
          : 'Unknown'}
      </p>
      <div className="row wrap">
        {stats.data?.categories.map((c) => (
          <span className="badge" key={c.category}>
            {c.category}: {c.count}
          </span>
        ))}
      </div>
    </section>
  );
}
