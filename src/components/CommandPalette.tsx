import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Plus, Settings, ArrowUpRight } from 'lucide-react';
import { useUI } from '../stores/ui';
import { useAvatars } from '../hooks/useVault';
import { query } from '../db/bridge';
import { Modal } from './ui/dialog';
export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen),
    setOpen = useUI((s) => s.setPalette),
    setImport = useUI((s) => s.setImport);
  const [search, setSearch] = useState('');
  const navigate = useNavigate(),
    location = useLocation();
  const { data: avatars = [] } = useAvatars();
  const { data: matches = [] } = useQuery({
    queryKey: ['search', search],
    enabled: open && search.trim().length > 0,
    queryFn: () => {
      const term = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      return query<{ avatar_id: string; label: string; kind: string }>(
        `SELECT avatar_id,title AS label,'change' AS kind FROM changelog_entries WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' UNION ALL SELECT avatar_id,title AS label,'task' AS kind FROM todos WHERE title LIKE ? ESCAPE '\\' UNION ALL SELECT avatar_id,'v'||version||' · '||title AS label,'release' AS kind FROM releases WHERE version LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' LIMIT 30`,
        term,
        term,
        term,
        term,
        term,
      );
    },
  });
  function go(path: string) {
    setOpen(false);
    navigate(path);
  }
  const current = location.pathname.match(/^\/avatars\/([^/]+)/)?.[1];
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Search your vault"
      description="Avatars, IDs, tags, notes, changes, versions and tasks."
    >
      <div className="search-field palette-search">
        <Search size={18} />
        <input
          autoFocus
          placeholder="Type a name, change or command…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Global search"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              document
                .querySelector<HTMLButtonElement>('.command-list button:not([hidden])')
                ?.focus();
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              document
                .querySelector<HTMLButtonElement>('.command-list button:not([hidden])')
                ?.click();
            }
          }}
        />
      </div>
      <div
        className="command-list"
        onKeyDown={(e) => {
          const buttons = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([hidden])'),
          );
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            buttons[
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? buttons.length - 1
                  : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            ]?.focus();
          }
        }}
      >
        <button
          hidden={!'import avatar'.includes(search.toLowerCase())}
          onClick={() => {
            setOpen(false);
            setImport(true);
          }}
        >
          <Plus size={16} />
          <span>Import Avatar</span>
          <kbd>Ctrl I</kbd>
        </button>
        <button
          hidden={!'open settings'.includes(search.toLowerCase())}
          onClick={() => go('/settings')}
        >
          <Settings size={16} />
          <span>Open Settings</span>
        </button>
        {[
          ['Personal tags', '/tags'],
          ['All changelogs', '/changelogs'],
          ['Work sessions', '/workspace/work'],
          ['Snapshots', '/workspace/snapshots'],
        ]
          .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))
          .map(([name, path]) => (
            <button key={path} onClick={() => go(path)}>
              <ArrowUpRight size={16} />
              <span>{name}</span>
            </button>
          ))}
        {current &&
          [
            'Add Change',
            'Create Release',
            'Refresh VRChat Data',
            'Open Changelog',
            'Create Snapshot',
            'Start Work Session',
            'Open Unity Project',
          ].map((action, i) => (
            <button
              key={action}
              hidden={!action.toLowerCase().includes(search.toLowerCase())}
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(
                  new CustomEvent('vault-quick-action', { detail: { action: i } }),
                );
              }}
            >
              <ArrowUpRight size={16} />
              <span>{action}</span>
            </button>
          ))}
        {avatars
          .filter((a) =>
            `${a.name} ${a.vrchat_id} ${a.tags.join(' ')} ${a.notes} ${a.custom_version}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .slice(0, 15)
          .map((a) => (
            <button key={a.id} onClick={() => go(`/avatars/${a.id}`)}>
              <span className="command-avatar">{a.name[0]}</span>
              <span>{a.name}</span>
              <small>v{a.custom_version}</small>
            </button>
          ))}
        {matches.map((m, i) => (
          <button
            key={`${m.kind}-${i}`}
            onClick={() =>
              go(
                `/avatars/${m.avatar_id}?tab=${m.kind === 'task' ? 'Notes' : m.kind === 'release' ? 'Versions' : 'Changelog'}`,
              )
            }
          >
            <ArrowUpRight size={16} />
            <span>{m.label}</span>
            <small>{m.kind}</small>
          </button>
        ))}
      </div>
    </Modal>
  );
}
