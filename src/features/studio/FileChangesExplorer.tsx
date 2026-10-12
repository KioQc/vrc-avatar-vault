import { useMemo, useState } from 'react';
import { Folder, FileCode2, ArrowRight, Search } from 'lucide-react';
import type { FileChange } from '../../types/studio';
import { changeLabel, fileFolder, filterFiles } from '../../utils/workflow';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { CopyButton } from '../../components/common';
import { invoke } from '@tauri-apps/api/core';
import { desktop, mockMode } from '../../db/bridge';
import { useAction } from '../../hooks/useVault';
export function FileChangesExplorer({
  changes,
  title = 'Changed files',
  avatarId,
  projectPath,
}: {
  changes: FileChange[];
  title?: string;
  avatarId?: string;
  projectPath?: string;
}) {
  const [search, setSearch] = useState(''),
    [type, setType] = useState('All'),
    [kind, setKind] = useState('All'),
    [folder, setFolder] = useState('All'),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<FileChange | null>(null);
  const openFolder = useAction((path: string) =>
    invoke('unity_file_folder', { avatarId, projectPath, relativePath: path }),
  );
  const locate = useAction((path: string) =>
    invoke('integration_request', { avatarId, operation: 'locate', relativePath: path }),
  );
  const filtered = useMemo(
    () => filterFiles(changes, search, type, kind, 'All'),
    [changes, search, type, kind],
  );
  const folderCounts = useMemo(
    () =>
      filtered.reduce<Map<string, number>>((counts, c) => {
        const folder = fileFolder(c.path);
        counts.set(folder, (counts.get(folder) ?? 0) + 1);
        return counts;
      }, new Map()),
    [filtered],
  );
  const folders = [...folderCounts.keys()].sort();
  const currentFolder = folders.includes(folder) ? folder : 'All';
  const visible = filterFiles(filtered, '', 'All', 'All', currentFolder);
  const pages = Math.max(1, Math.ceil(visible.length / 40)),
    currentPage = Math.min(page, pages);
  const kinds = [...new Set(changes.map((c) => c.kind))].sort();
  return (
    <section className="file-explorer">
      <div className="row between wrap">
        <h3>{title}</h3>
        <span className="badge">
          {visible.length} / {changes.length} files
        </span>
      </div>
      <div className="file-explorer-search">
        <Search size={16} />
        <input
          aria-label="Search changed files"
          placeholder="Search a filename or path…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="row wrap file-change-filters">
        {['All', 'Added', 'Modified', 'Removed', 'Renamed'].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={type === value ? 'default' : 'secondary'}
            onClick={() => {
              setType(value);
              setPage(1);
            }}
          >
            {value} ·{' '}
            {value === 'All'
              ? changes.length
              : changes.filter((c) => changeLabel(c.type) === value).length}
          </Button>
        ))}
        <select
          aria-label="File type"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        >
          <option value="All">All file types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              .{k}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={() => {
            setSearch('');
            setType('All');
            setKind('All');
            setFolder('All');
            setPage(1);
          }}
        >
          Reset filters
        </Button>
      </div>
      <div className="file-explorer-body">
        <nav aria-label="Changed file folders" className="file-folder-nav">
          <button
            className={currentFolder === 'All' ? 'active' : ''}
            onClick={() => {
              setFolder('All');
              setPage(1);
            }}
          >
            <Folder size={16} />
            All folders<span>{filtered.length}</span>
          </button>
          {folders.map((f) => (
            <button
              key={f}
              className={currentFolder === f ? 'active' : ''}
              title={f}
              onClick={() => {
                setFolder(f);
                setPage(1);
              }}
            >
              <Folder size={15} />
              <span className="folder-label">{f}</span>
              <small>{folderCounts.get(f)}</small>
            </button>
          ))}
        </nav>
        <div className="file-results">
          <div className="file-breadcrumb">
            <button
              onClick={() => {
                setFolder('All');
                setPage(1);
              }}
            >
              Project
            </button>
            {currentFolder !== 'All' && (
              <>
                <ArrowRight size={13} />
                <span>{currentFolder}</span>
              </>
            )}
          </div>
          {!visible.length && (
            <p className="notice">
              {changes.length
                ? 'No files match these filters. Reset filters to see all changes.'
                : 'No detected file changes.'}
            </p>
          )}
          {visible.slice((currentPage - 1) * 40, currentPage * 40).map((c) => (
            <button
              className="file-result"
              key={`${c.type}:${c.path}:${c.oldPath ?? ''}`}
              onClick={() => setSelected(c)}
            >
              <FileCode2 size={18} />
              <span className="file-result-name">
                <strong>{c.path.replace(/\\/g, '/').split('/').at(-1)}</strong>
                <small>{fileFolder(c.path)}</small>
                {c.oldPath && <small className="file-rename">From {c.oldPath}</small>}
              </span>
              <span className={`file-change-status status-${changeLabel(c.type).toLowerCase()}`}>
                {changeLabel(c.type)}
              </span>
            </button>
          ))}
          <div className="row between file-pagination">
            <Button size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              Previous
            </Button>
            <span className="tiny muted">
              Page {currentPage} / {pages}
            </span>
            <Button
              size="sm"
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="File change details"
        description="Paths are relative to the linked Unity project."
      >
        {selected && (
          <>
            <span className="badge">
              {changeLabel(selected.type)} · .{selected.kind}
            </span>
            <h3>Current path</h3>
            <p className="break-all">{selected.path}</p>
            <CopyButton text={selected.path} label="Copy path" />
            <Button
              disabled={
                !desktop || mockMode || !avatarId || locate.isPending || selected.type === 'Deleted'
              }
              onClick={() => locate.mutate(selected.path)}
            >
              Locate in Unity
            </Button>
            {locate.error && (
              <p role="alert" className="notice">
                {String(locate.error)}
              </p>
            )}
            <Button
              disabled={!desktop || mockMode || !avatarId || !projectPath || openFolder.isPending}
              onClick={() => openFolder.mutate(selected.path)}
            >
              Open containing folder
            </Button>
            {openFolder.error && (
              <p role="alert" className="notice">
                {String(openFolder.error)}
              </p>
            )}
            <p className="tiny muted">
              To locate an asset in Unity, copy this path and use Locate asset in the Unity Bridge
              window.
            </p>
            {selected.oldPath && (
              <>
                <h3>Previous path</h3>
                <p className="break-all">{selected.oldPath}</p>
              </>
            )}
            <p className="tiny muted">
              VAV records the detected change. Viewing it does not edit, move or delete the file.
            </p>
          </>
        )}
      </Modal>
    </section>
  );
}
