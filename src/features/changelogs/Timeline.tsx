import { ContextMenu } from '../../components/ui/context-menu';
import { useQuery } from '@tanstack/react-query';
import { query } from '../../db/bridge';
import { ChangeImages } from './ChangeImages';
import { useState } from 'react';
import { Pencil, Copy, Trash2, Download } from 'lucide-react';
import type { Change, Release } from '../../types/domain';
import { Badge, Empty, dateText, copy } from '../../components/common';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { exportMarkdownChangelog, groupChangesByCategory, splitDiscord } from '../../utils/domain';
import { saveText } from '../../services/files';
import { useAction } from '../../hooks/useVault';
import { repository } from '../../db/repository';
export function Timeline({
  name,
  avatarId,
  changes,
  releases,
  onEdit,
}: {
  name: string;
  avatarId?: string;
  changes: Change[];
  releases: Release[];
  onEdit: (c: Change) => void;
}) {
  const links = useQuery({
    queryKey: ['release-links', avatarId],
    queryFn: () =>
      query<{
        release_id: string;
        known_issues_json: string;
        snapshot_ids: string;
        api_after: number | null;
        captures: number;
      }>(
        'SELECT l.*, (SELECT count(*) FROM studio_snapshots s WHERE s.release_id=l.release_id) captures FROM release_links l WHERE l.avatar_id=?',
        avatarId!,
      ),
    enabled: !!avatarId,
  });
  const issuesFor = (id?: string) => {
    const entry = links.data?.find((l) => l.release_id === id);
    const issues = entry
      ? (JSON.parse(entry.known_issues_json) as { title: string; description: string }[])
      : [];
    return issues.length
      ? '\n\n## Known issues\n' + issues.map((b) => `- ${b.title}: ${b.description}`).join('\n')
      : '';
  };
  const [selectedVersion, setSelectedVersion] = useState('unreleased');
  const [viewing, setViewing] = useState<Change | null>(null);
  const [deleting, setDeleting] = useState<Change | null>(null),
    [exportText, setExportText] = useState<string[] | null>(null),
    [limit, setLimit] = useState(50);
  const remove = useAction(async () => {
    if (deleting) await repository.deleteChange(deleting.id);
    setDeleting(null);
  }, 'Change deleted');
  const duplicate = useAction(
    (c: Change) =>
      repository.saveChange(c.avatar_id, {
        ...c,
        title: `${c.title} (copy)`,
        release_id: null,
        created_at: new Date().toISOString(),
      }),
    'Change duplicated to Unreleased',
  );
  const save = useAction((text: string) => saveText('CHANGELOG.md', text));
  const groups = [null, ...releases];
  return (
    <>
      <div className="release-workspace">
        <nav className="release-nav" aria-label="Release history">
          <h4>VERSIONS</h4>
          {groups.map((r) => (
            <button
              className={selectedVersion === (r?.id ?? 'unreleased') ? 'active' : ''}
              key={r?.id ?? 'unreleased'}
              onClick={() => setSelectedVersion(r?.id ?? 'unreleased')}
            >
              {r ? `v${r.version}` : 'Unreleased'}{' '}
              <small>· {changes.filter((c) => c.release_id === (r?.id ?? null)).length}</small>
            </button>
          ))}
        </nav>
        <div>
          {changes.length === 0 && releases.length === 0 ? (
            <Empty
              title="No changes recorded yet"
              description="Add your first change to start building your avatar’s history."
            />
          ) : (
            groups
              .filter((r) => (r?.id ?? 'unreleased') === selectedVersion)
              .map((r) => {
                const rows = changes.filter((c) => c.release_id === (r?.id ?? null));

                const text = exportMarkdownChangelog(name, r, rows) + issuesFor(r?.id);
                return (
                  <section className="timeline-section" key={r?.id ?? 'unreleased'}>
                    <div className="section-heading">
                      <div className="row">
                        <span className="release-marker" />
                        <h2>{r ? `v${r.version}` : 'Unreleased'}</h2>
                        <Badge>{rows.length} changes</Badge>
                      </div>
                      <div className="row">
                        <Button size="sm" onClick={() => void copy(text)}>
                          Copy Markdown
                        </Button>
                        <Button size="sm" onClick={() => save.mutate(text)}>
                          <Download size={13} />
                          .md
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            setExportText(
                              splitDiscord(
                                exportMarkdownChangelog(name, r, rows, true) + issuesFor(r?.id),
                              ),
                            )
                          }
                        >
                          Discord
                        </Button>
                      </div>
                    </div>
                    {r && (
                      <p className="muted">
                        {dateText(r.released_at)} · {r.title}
                      </p>
                    )}
                    {r && (
                      <div className="release-metadata">
                        <span>
                          {links.data?.find((l) => l.release_id === r.id)?.captures ?? 0} linked
                          Unity / filesystem captures
                        </span>
                        <span>
                          VRChat upload:{' '}
                          {links.data?.find((l) => l.release_id === r.id)?.api_after ??
                            'Not associated'}
                        </span>
                        <span>
                          {rows.filter((c) => c.categories.includes('Fixed')).length} fixes
                        </span>
                        <span>
                          {rows.filter((c) => c.categories.includes('Optimized')).length}{' '}
                          optimizations
                        </span>
                      </div>
                    )}
                    {r?.description && <p className="preserve-lines">{r.description}</p>}
                    {Object.entries(groupChangesByCategory(rows.slice(0, limit))).map(
                      ([cat, entries]) => (
                        <div className="timeline-category" key={cat}>
                          <h4>{cat}</h4>
                          {entries.map((c) => (
                            <ContextMenu
                              key={c.id}
                              actions={[
                                { label: 'Edit / move to release', run: () => onEdit(c) },
                                { label: 'Duplicate', run: () => duplicate.mutate(c) },
                                { label: 'Delete', run: () => setDeleting(c) },
                              ]}
                            >
                              <article className="change-row">
                                <div className="grow">
                                  <button className="change-title" onClick={() => setViewing(c)}>
                                    <span className="category-label" data-category={cat}>
                                      {cat} ·{' '}
                                    </span>
                                    <strong>{c.title}</strong>
                                  </button>
                                  {c.description && (
                                    <p className="preserve-lines muted">{c.description}</p>
                                  )}
                                  <ChangeImages avatarId={c.avatar_id} entryId={c.id} />
                                  <div className="row tiny muted">
                                    <span>{dateText(c.created_at)}</span>
                                    <Badge>{c.platform}</Badge>
                                    {c.importance !== 'Normal' && (
                                      <Badge tone={c.importance === 'Breaking' ? 'red' : ''}>
                                        {c.importance}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="row change-actions">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Edit or move change"
                                    title="Edit or move change"
                                    onClick={() => onEdit(c)}
                                  >
                                    <Pencil size={14} />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Duplicate change"
                                    title="Duplicate change"
                                    onClick={() => duplicate.mutate(c)}
                                  >
                                    <Copy size={14} />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Delete change"
                                    title="Delete change"
                                    onClick={() => setDeleting(c)}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </article>
                            </ContextMenu>
                          ))}
                        </div>
                      ),
                    )}
                    {rows.length > limit && (
                      <Button onClick={() => setLimit(limit + 50)}>Load more changes</Button>
                    )}
                  </section>
                );
              })
          )}
        </div>
      </div>
      <Modal
        drawer
        open={!!viewing}
        onOpenChange={(v) => {
          if (!v) setViewing(null);
        }}
        title={viewing?.title ?? 'Change'}
        description={viewing ? `${viewing.platform} · ${dateText(viewing.created_at)}` : ''}
      >
        {viewing && (
          <>
            <p className="preserve-lines">{viewing.description || 'No description.'}</p>
            <ChangeImages avatarId={viewing.avatar_id} entryId={viewing.id} />
            <div className="dialog-actions">
              <Button
                onClick={() => {
                  onEdit(viewing);
                  setViewing(null);
                }}
              >
                Edit or move to release
              </Button>
              <Button onClick={() => duplicate.mutate(viewing)}>Duplicate</Button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v) setDeleting(null);
        }}
        title="Delete this change?"
        description={deleting?.title}
      >
        <div className="dialog-actions">
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Delete local change
          </Button>
        </div>
      </Modal>
      <Modal
        open={!!exportText}
        onOpenChange={(v) => {
          if (!v) setExportText(null);
        }}
        title="Discord export"
        description="Each part fits within 2,000 characters. Copy and post them in order."
        wide
      >
        {exportText?.map((text, i) => (
          <div key={i}>
            <div className="row between">
              <h4>Part {i + 1}</h4>
              <Button size="sm" onClick={() => void copy(text)}>
                Copy part · {text.length} characters
              </Button>
            </div>
            <pre>{text}</pre>
          </div>
        ))}
      </Modal>
    </>
  );
}
