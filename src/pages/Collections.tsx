import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { repository } from '../db/repository';
import { useAction, useAvatars } from '../hooks/useVault';
import { Badge, Empty, dateText, ErrorNotice, Loading } from '../components/common';
import { Button } from '../components/ui/button';
export function Changelogs() {
  const { data: avatars = [] } = useAvatars();
  const {
    data: changes = [],
    error,
    isLoading,
  } = useQuery({ queryKey: ['changes'], queryFn: () => repository.changes() });
  const [search, setSearch] = useState(''),
    [limit, setLimit] = useState(50);
  const filtered = changes.filter((c) =>
    `${c.title} ${c.description} ${c.categories.join(' ')}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Changelogs</h1>
          <p>The story behind every iteration.</p>
        </div>
      </div>
      <input
        className="wide-search"
        placeholder="Search changes…"
        aria-label="Search changes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error ? (
        <ErrorNotice error={error} />
      ) : isLoading ? (
        <Loading />
      ) : filtered.length ? (
        <section className="panel">
          {filtered.slice(0, limit).map((c) => (
            <Link key={c.id} className="activity-row" to={`/avatars/${c.avatar_id}?tab=Changelog`}>
              <span className="timeline-dot" />
              <div className="grow">
                <strong>{c.title}</strong>
                <p className="muted">
                  {avatars.find((a) => a.id === c.avatar_id)?.name} · {dateText(c.created_at)}
                </p>
                <p className="tiny muted">{c.description.slice(0, 180)}</p>
              </div>
              <Badge tone="purple">{c.categories[0]}</Badge>
              {!c.release_id && <Badge>Unreleased</Badge>}
            </Link>
          ))}
          {filtered.length > limit && (
            <Button onClick={() => setLimit(limit + 50)}>Load more</Button>
          )}
        </section>
      ) : (
        <Empty title="No changes yet" description="Open an avatar and add your first change." />
      )}
    </>
  );
}
export function Activity() {
  const { data: avatars = [] } = useAvatars();
  const {
    data: events = [],
    error,
    isLoading,
  } = useQuery({ queryKey: ['activity'], queryFn: () => repository.activity() });
  const [avatar, setAvatar] = useState(''),
    [type, setType] = useState(''),
    [date, setDate] = useState(''),
    [limit, setLimit] = useState(50);
  const filtered = events.filter(
    (e) =>
      (!avatar || e.avatar_id === avatar) &&
      (!type || e.type === type) &&
      (!date || e.created_at.startsWith(date)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Activity</h1>
          <p>A timeline of your local workspace.</p>
        </div>
      </div>
      <div className="toolbar">
        <select
          aria-label="Filter by avatar"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
        >
          <option value="">All avatars</option>
          {avatars.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by activity type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All types</option>
          {[...new Set(events.map((e) => e.type))].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          aria-label="Filter by date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {error ? (
        <ErrorNotice error={error} />
      ) : isLoading ? (
        <Loading />
      ) : filtered.length ? (
        <section className="panel">
          {filtered.slice(0, limit).map((e) => (
            <div className="activity-row" key={e.id}>
              <span className="tiny muted activity-date">{dateText(e.created_at)}</span>
              <span className="timeline-dot" />
              <div className="grow">
                {e.avatar_id ? <Link to={`/avatars/${e.avatar_id}`}>{e.message}</Link> : e.message}
              </div>
              <Badge>{e.type}</Badge>
            </div>
          ))}
          {filtered.length > limit && (
            <Button onClick={() => setLimit(limit + 50)}>Load more</Button>
          )}
        </section>
      ) : (
        <Empty
          title="No activity to show"
          description="Imports, changes, releases and snapshots appear here."
        />
      )}
    </>
  );
}
export function Tags() {
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: () => repository.tags() });
  const { data: avatars = [] } = useAvatars();
  const [selected, setSelected] = useState(''),
    [rename, setRename] = useState('');
  const action = useAction(async (kind: string) => {
    if (kind === 'rename') await repository.renameTag(selected, rename);
    if (kind === 'delete') await repository.deleteTag(selected);
    setSelected('');
    setRename('');
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tags</h1>
          <p>Organize your collection your way.</p>
        </div>
      </div>
      {tags.length ? (
        <div className="tag-grid">
          {tags.map((t) => (
            <button
              className={`panel tag-card ${selected === t.id ? 'selected' : ''}`}
              key={t.id}
              onClick={() => {
                setSelected(t.id);
                setRename(t.name);
              }}
            >
              <Badge tone="purple">{t.name}</Badge>
              <p className="muted">{t.count} avatars</p>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="No personal tags yet"
          description="Add tags from an avatar’s Overview, or tag several avatars together."
        />
      )}
      {selected && (
        <section className="panel">
          <div className="row">
            <input
              aria-label="Rename tag"
              value={rename}
              onChange={(e) => setRename(e.target.value)}
            />
            <Button onClick={() => action.mutate('rename')}>Rename</Button>
            <Button variant="destructive" onClick={() => action.mutate('delete')}>
              Remove tag
            </Button>
          </div>
          {avatars
            .filter((a) => a.tags.includes(tags.find((t) => t.id === selected)?.name ?? ''))
            .map((a) => (
              <p key={a.id}>
                <Link to={`/avatars/${a.id}`}>{a.name}</Link>
              </p>
            ))}
        </section>
      )}
    </>
  );
}
