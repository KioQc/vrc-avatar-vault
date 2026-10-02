import { ContextMenu } from '../../components/ui/context-menu';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { studio } from '../../services/studio';
import { useAction } from '../../hooks/useVault';
import { repository } from '../../db/repository';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { ErrorNotice, timeAgo } from '../../components/common';
import { saveText } from '../../services/files';
import { bugStatuses, openBug, type Bug } from '../../types/studio';
export function BugsPanel({ avatarId, version }: { avatarId: string; version: string }) {
  const bugs = useQuery({ queryKey: ['bugs', avatarId], queryFn: () => studio.bugs(avatarId) });
  const images = useQuery({
    queryKey: ['attachments', avatarId],
    queryFn: () => repository.attachments(avatarId),
  });
  const [draft, setDraft] = useState<Partial<Bug> | null>(null),
    [filter, setFilter] = useState('All'),
    [search, setSearch] = useState(''),
    [severity, setSeverity] = useState('All'),
    [fixed, setFixed] = useState<Bug | null>(null);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get('bug');
    if (id && bugs.data) {
      const b = bugs.data.find((v) => v.id === id);
      if (b) setDraft(b);
      const next = new URLSearchParams(params);
      next.delete('bug');
      setParams(next, { replace: true });
    }
  }, [bugs.data, params, setParams]);
  const save = useAction(async () => {
    if (draft) {
      await studio.saveBug(avatarId, draft);
      if (draft.status === 'Fixed') setFixed(draft as Bug);
      setDraft(null);
    }
  });
  const convert = useAction(async () => {
    if (fixed) {
      await repository.saveChange(avatarId, {
        title: `Fixed ${fixed.title}`,
        description: fixed.description ?? '',
        categories: ['Fixed'],
        importance: 'Normal',
        platform: 'All',
        release_id: null,
        created_at: new Date().toISOString(),
      });
      setFixed(null);
    }
  }, 'Added to unreleased changelog');
  const issues = bugs.data?.filter((b) => b.known_issue && openBug(b)) ?? [];
  return (
    <section className="panel">
      <div className="row wrap">
        <h2>Bugs & known issues</h2>
        <Button
          onClick={() =>
            setDraft({
              found_version: version,
              severity: 'Medium',
              status: 'Open',
              known_issue: 0,
              attachment_ids: '[]',
            })
          }
        >
          Report bug
        </Button>
        <Button
          onClick={() =>
            void saveText(
              'KNOWN-ISSUES.md',
              `# Known issues — v${version}\n\n${issues.map((b) => `- ${b.title}: ${b.description}`).join('\n')}`,
            )
          }
        >
          Export known issues
        </Button>
      </div>
      {bugs.error && <ErrorNotice error={bugs.error} />}
      <div className="row">
        <input
          aria-label="Search bugs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bugs…"
        />
        <select aria-label="Bug status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All</option>
          {bugStatuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Severity filter"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          {['All', 'Low', 'Medium', 'High', 'Critical'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {['Issue', 'Status', 'Severity', 'Version', 'Updated'].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bugs.data
              ?.filter(
                (b) =>
                  (filter === 'All' || b.status === filter) &&
                  (severity === 'All' || b.severity === severity) &&
                  b.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((b) => (
                <tr key={b.id}>
                  <td>
                    <ContextMenu
                      actions={[
                        { label: 'Open issue', run: () => setDraft(b) },
                        { label: 'Change status', run: () => setDraft(b) },
                        { label: 'Add to changelog', run: () => setFixed(b) },
                      ]}
                    >
                      <button className="text-button" onClick={() => setDraft(b)}>
                        {b.title}
                      </button>
                    </ContextMenu>
                    {!!b.known_issue && <small className="muted">Known issue</small>}
                  </td>
                  <td>
                    <span className="status-dot" data-active={b.status === 'Fixed'}>
                      {b.status}
                    </span>
                  </td>
                  <td>
                    <span data-severity={b.severity}>{b.severity}</span>
                  </td>
                  <td>{b.found_version || '—'}</td>
                  <td>{timeAgo(b.updated_at)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {!bugs.data?.length && (
          <p className="empty-inline">
            No bugs recorded. Report a reproducible issue to start tracking it.
          </p>
        )}
      </div>
      <Modal
        drawer
        open={!!draft}
        onOpenChange={(v) => {
          if (
            !v &&
            (!draft ||
              JSON.stringify(draft) === JSON.stringify(bugs.data?.find((b) => b.id === draft.id)) ||
              window.confirm('Discard unsaved bug changes?'))
          )
            setDraft(null);
        }}
        title={draft?.id ? 'Edit bug' : 'Report bug'}
        description="Track reproducible problems and optionally include them in known issues."
      >
        {draft && (
          <>
            <div className="form-grid">
              {['title', 'found_version', 'target_version'].map((key) => (
                <label key={key}>
                  {key.replace('_', ' ')}
                  <input
                    value={String(draft[key as keyof Bug] ?? '')}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                Severity
                <select
                  value={draft.severity}
                  onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
                >
                  {['Low', 'Medium', 'High', 'Critical'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
                  {bugStatuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            {['description', 'steps', 'expected', 'actual'].map((key) => (
              <label key={key}>
                {key}
                <textarea
                  value={String(draft[key as keyof Bug] ?? '')}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!draft.known_issue}
                onChange={(e) => setDraft({ ...draft, known_issue: Number(e.target.checked) })}
              />
              Show as known issue while unresolved
            </label>
            <h4>Attach images from the avatar's Files tab</h4>
            {images.data?.map((a) => {
              const ids = JSON.parse(draft.attachment_ids ?? '[]') as string[];
              return (
                <label className="check-row" key={a.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(a.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        attachment_ids: JSON.stringify(
                          e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
                        ),
                      })
                    }
                  />
                  {a.caption || a.path}
                </label>
              );
            })}
            {draft.id && (
              <div className="row">
                <Button onClick={() => setDraft({ ...draft, status: 'Fixed' })}>Mark fixed</Button>
                <Button onClick={() => setFixed(draft as Bug)}>Add to changelog</Button>
                <span className="tiny muted">Updated {timeAgo(draft.updated_at ?? null)}</span>
              </div>
            )}
            <div className="dialog-actions">
              <Button onClick={() => setDraft(null)}>Cancel</Button>
              <Button
                disabled={!draft.title?.trim() || save.isPending}
                onClick={() => save.mutate()}
              >
                Save bug
              </Button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!fixed}
        onOpenChange={(v) => {
          if (!v) setFixed(null);
        }}
        title="Create changelog entry?"
        description="The bug is saved. Adding an official changelog entry is optional."
      >
        <p>Fixed {fixed?.title}</p>
        <div className="dialog-actions">
          <Button onClick={() => setFixed(null)}>Not now</Button>
          <Button disabled={convert.isPending} onClick={() => convert.mutate()}>
            Create Fixed entry
          </Button>
        </div>
      </Modal>
    </section>
  );
}
