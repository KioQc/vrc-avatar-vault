import { useWorkspace } from '../components/workspace';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Grid2X2,
  List,
  Plus,
  Search,
  RefreshCw,
  Archive,
  Download,
  Tag,
  Trash2,
} from 'lucide-react';
import { useAvatars, useAction } from '../hooks/useVault';
import { useUI } from '../stores/ui';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/dialog';
import { AvatarCard } from '../components/AvatarCard';
import { Badge, Empty, ErrorNotice, Loading, timeAgo } from '../components/common';
import { platforms } from '../utils/domain';
import { repository } from '../db/repository';
import { refreshAvatar } from '../services/sync';
import { exportBackup } from '../services/backup';
export function Avatars() {
  const { data: avatars = [], isLoading, error } = useAvatars(),
    setImport = useUI((s) => s.setImport);
  const [params, setParams] = useSearchParams();
  const { data: workspace } = useWorkspace();
  const search = params.get('q') ?? '',
    filter = params.get('filter') ?? 'All',
    sort = params.get('sort') ?? 'Last modified',
    view = params.get('view') ?? 'grid';
  const changeParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const setSearch = (v: string) => changeParam('q', v),
    setFilter = (v: string) => changeParam('filter', v),
    setSort = (v: string) => changeParam('sort', v),
    setView = (v: string) => changeParam('view', v);
  const [selected, setSelected] = useState<string[]>([]),
    [tag, setTag] = useState(''),
    [dialog, setDialog] = useState<'tag' | 'delete' | null>(null),
    [page, setPage] = useState(0);
  const bulk = useAction(async (kind: string) => {
    if (kind === 'export') await exportBackup(selected);
    else if (kind === 'tag') await repository.addTag(selected, tag);
    else if (kind === 'delete') await repository.removeAvatars(selected);
    else
      for (const id of selected) {
        const a = avatars.find((a) => a.id === id);
        if (!a) continue;
        if (kind === 'archive')
          await repository.updateAvatar(id, { archived: filter === 'Archived' ? 0 : 1 });
        if (kind === 'refresh') {
          const update = await refreshAvatar(a);
          if (update.differences.length)
            window.dispatchEvent(new CustomEvent('vault-detected', { detail: update }));
        }
      }
    setDialog(null);
    setSelected([]);
  }, 'Bulk action completed');
  const rows = avatars
    .filter((a) => {
      const p = platforms(a.data);
      return (
        (filter === 'Archived' ? !!a.archived : !a.archived) &&
        `${a.name} ${a.vrchat_id} ${a.tags.join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === 'Favorites'
          ? !!a.favorite
          : filter === 'PC + Quest'
            ? p.includes('PC') && p.includes('Quest')
            : ['PC', 'Quest'].includes(filter)
              ? p.includes(filter)
              : ['Public', 'Private'].includes(filter)
                ? a.data.releaseStatus.toLowerCase() === filter.toLowerCase()
                : true)
      );
    })
    .sort((a, b) =>
      sort === 'Name'
        ? a.name.localeCompare(b.name)
        : sort === 'Created'
          ? b.created_at.localeCompare(a.created_at)
          : sort === 'VRChat update'
            ? b.data.updated_at.localeCompare(a.data.updated_at)
            : sort === 'Custom version'
              ? b.custom_version.localeCompare(a.custom_version, undefined, { numeric: true })
              : b.favorite - a.favorite || b.updated_at.localeCompare(a.updated_at),
    );
  function choose(id: string, checked: boolean) {
    setSelected(checked ? [...selected, id] : selected.filter((v) => v !== id));
  }
  if (isLoading) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Avatars <span className="heading-count">{avatars.length}</span>
          </h1>
          <p>Your collection, versioned and organized.</p>
        </div>
        <Button variant="default" onClick={() => setImport(true)}>
          <Plus size={16} />
          Import Avatar
        </Button>
      </div>
      <div className="toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search by name, ID or tag…"
            aria-label="Search avatars"
          />
          {search && (
            <button
              className="text-button"
              title="Clear search"
              aria-label="Clear search"
              onClick={() => setSearch('')}
            >
              ×
            </button>
          )}
        </div>
        <select aria-label="Sort avatars" value={sort} onChange={(e) => setSort(e.target.value)}>
          {['Last modified', 'Name', 'Created', 'VRChat update', 'Custom version'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <Button
          aria-label="Grid view"
          title="Grid view"
          variant={view === 'grid' ? 'default' : 'secondary'}
          size="icon"
          onClick={() => setView('grid')}
        >
          <Grid2X2 size={16} />
        </Button>
        <Button
          aria-label="List view"
          title="List view"
          variant={view === 'list' ? 'default' : 'secondary'}
          size="icon"
          onClick={() => setView('list')}
        >
          <List size={16} />
        </Button>
      </div>
      <details className="filter-popover">
        <summary className="button secondary">
          Filters {filter !== 'All' ? `· ${filter}` : ''}
        </summary>
        <div className="filter-row">
          {['All', 'Favorites', 'PC', 'Quest', 'PC + Quest', 'Public', 'Private', 'Archived'].map(
            (f) => (
              <button
                className={filter === f ? 'active' : ''}
                onClick={() => {
                  setFilter(f);
                  setPage(0);
                }}
                key={f}
              >
                {f}
              </button>
            ),
          )}
        </div>
      </details>
      {selected.length > 0 && (
        <div className="bulk-bar">
          <strong>{selected.length} selected</strong>
          <Button size="sm" disabled={bulk.isPending} onClick={() => bulk.mutate('refresh')}>
            <RefreshCw size={14} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setDialog('tag')}>
            <Tag size={14} />
            Tag
          </Button>
          <Button size="sm" disabled={bulk.isPending} onClick={() => bulk.mutate('archive')}>
            <Archive size={14} />
            {filter === 'Archived' ? 'Restore' : 'Archive'}
          </Button>
          <Button size="sm" disabled={bulk.isPending} onClick={() => bulk.mutate('export')}>
            <Download size={14} />
            Export
          </Button>
          <Button size="sm" onClick={() => setDialog('delete')}>
            <Trash2 size={14} />
            Delete local
          </Button>
        </div>
      )}
      {rows.length ? (
        view === 'grid' ? (
          <div className="avatar-grid">
            {rows.slice(page * 24, (page + 1) * 24).map((a) => (
              <AvatarCard
                key={a.id}
                avatar={a}
                selected={selected.includes(a.id)}
                onSelect={(v) => choose(a.id, v)}
              />
            ))}
          </div>
        ) : (
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>
                    <button className="text-button" onClick={() => setSort('Name')}>
                      Avatar ↕
                    </button>
                  </th>
                  <th>
                    <button className="text-button" onClick={() => setSort('Custom version')}>
                      Version ↕
                    </button>
                  </th>
                  <th>VRChat</th>
                  <th>Platforms</th>
                  <th>Unity</th>
                  <th>Changes</th>
                  <th>
                    <button className="text-button" onClick={() => setSort('Last modified')}>
                      Modified ↕
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 24, (page + 1) * 24).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(a.id)}
                        aria-label={`Select ${a.name}`}
                        onChange={(e) => choose(a.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <Link to={`/avatars/${a.id}`}>{a.name}</Link>
                    </td>
                    <td>v{a.custom_version}</td>
                    <td>{a.data.version}</td>
                    <td>
                      {platforms(a.data).map((p) => (
                        <Badge key={p}>{p}</Badge>
                      ))}
                    </td>
                    <td>
                      {workspace?.avatars.find((w) => w.id === a.id)?.project
                        ? 'Linked'
                        : 'Not linked'}
                    </td>
                    <td>{workspace?.avatars.find((w) => w.id === a.id)?.changes ?? 0}</td>
                    <td>{timeAgo(a.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Empty
          title="No avatars found"
          description="Import an avatar or adjust your filters."
          action={<Button onClick={() => setImport(true)}>Import Avatar</Button>}
        />
      )}
      <div className="pagination">
        <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(rows.length / 24))}
        </span>
        <Button disabled={(page + 1) * 24 >= rows.length} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
      <Modal
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title={dialog === 'delete' ? 'Delete local data?' : 'Add personal tag'}
        description={
          dialog === 'delete'
            ? 'This removes the selected local trackers and their history. VRChat avatars are unaffected.'
            : 'Apply a personal tag to all selected avatars.'
        }
      >
        {dialog === 'tag' && (
          <label>
            Tag
            <input value={tag} onChange={(e) => setTag(e.target.value)} />
          </label>
        )}
        <div className="dialog-actions">
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button
            variant={dialog === 'delete' ? 'destructive' : 'default'}
            disabled={bulk.isPending}
            onClick={() => bulk.mutate(dialog ?? '')}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}
