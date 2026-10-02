import { useQuery } from '@tanstack/react-query';
import { useUpdateStatus } from '../features/updates/UpdateCenter';
import { useOnlineUpdateStatus } from '../features/updates/OnlineUpdateCenter';
import { version as appVersion } from '../../package.json';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  Box,
  House,
  Layers,
  Star,
  Archive,
  Activity,
  Bug,
  Timer,
  Camera,
  Package,
  Settings,
  Radio,
  Search,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { useAvatars, useAction } from '../hooks/useVault';
import { query, desktop, mockMode } from '../db/bridge';
import { useUI } from '../stores/ui';
import { AvatarImage } from './common';
import { durationText } from '../utils/studio';
import { studio } from '../services/studio';
import type { WorkSession } from '../types/studio';
export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace-summary'],
    refetchInterval: 5000,
    queryFn: async () => ({
      avatars: await query<{
        id: string;
        bugs: number;
        changes: number;
        tasks: number;
        files: number;
        project: string | null;
      }>(
        `SELECT a.id,(SELECT count(*) FROM bugs b WHERE b.avatar_id=a.id AND b.status NOT IN ('Fixed','Duplicate','Won''t Fix')) bugs,(SELECT count(*) FROM changelog_entries c WHERE c.avatar_id=a.id AND c.release_id IS NULL) changes,(SELECT count(*) FROM todos t WHERE t.avatar_id=a.id AND t.completed=0) tasks,(SELECT count(*) FROM development_batches d WHERE d.avatar_id=a.id AND d.status='Review') files,(SELECT path FROM unity_projects u WHERE u.avatar_id=a.id) project FROM avatars a`,
      ),
      work: await query<WorkSession & { name: string }>(
        "SELECT w.*,a.name FROM work_sessions w JOIN avatars a ON a.id=w.avatar_id WHERE w.status IN ('Running','Paused','Interrupted') ORDER BY started_at DESC",
      ),
      presence:
        desktop && !mockMode
          ? await invoke<{ running: boolean; presence?: { project?: string; at: number } }>(
              'integration_control',
              { operation: 'status' },
            ).catch(() => null)
          : null,
    }),
  });
}
const groups = [
  { name: '', items: [['/', 'Overview', House]] },
  {
    name: 'Library',
    items: [
      ['/avatars', 'Avatars', Layers],
      ['/avatars?filter=Favorites', 'Favorites', Star],
      ['/avatars?filter=Archived', 'Archived', Archive],
    ],
  },
  {
    name: 'Development',
    items: [
      ['/activity', 'Activity', Activity],
      ['/workspace/bugs', 'Bugs', Bug],
      ['/workspace/work', 'Work Sessions', Timer],
    ],
  },
  {
    name: 'Tools',
    items: [
      ['/workspace/snapshots', 'Snapshots', Camera],
      ['/workspace/dependencies', 'Dependencies', Package],
      ['/vrchat', 'VRChat & OSC', Radio],
    ],
  },
] as const;
export function AppSidebar() {
  const { data: avatars = [] } = useAvatars();
  const location = useLocation();
  const current = avatars.find((a) => location.pathname === `/avatars/${a.id}`);
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <span className="brand-symbol">
          <Box size={20} />
        </span>
        <div>
          VRC Avatar Vault<small>AVATAR WORKSPACE</small>
        </div>
      </Link>
      <nav>
        {groups.map((g) => (
          <div key={g.name}>
            {g.name && <div className="sidebar-label">{g.name}</div>}
            {g.items.map(([path, label, Icon]) => (
              <Link
                title={label}
                key={path}
                to={path}
                className={`nav-link ${location.pathname + location.search === path || (path === '/avatars' && (!!current || (location.pathname === '/avatars' && !['Favorites', 'Archived'].includes(new URLSearchParams(location.search).get('filter') ?? '')))) ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {current && (
        <div className="current-avatar">
          <div className="sidebar-label">Current avatar</div>
          <div className="row">
            <AvatarImage name={current.name} src={current.data.thumbnailImageUrl} />
            <div>
              <strong>{current.name}</strong>
              <small>v{current.custom_version}</small>
            </div>
          </div>
          <div className="context-shortcuts">
            {['Overview', 'Changelog', 'Bugs', 'Unity', 'Performance'].map((t) => (
              <Link key={t} to={`/avatars/${current.id}?tab=${t}`}>
                {t === 'Changelog' ? 'Changes' : t}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="sidebar-bottom">
        <NavLink to="/settings" className="nav-link" title="Settings">
          <Settings size={16} />
          <span>Settings</span>
        </NavLink>
        <small className="muted">Local workspace · v{appVersion}</small>
      </div>
    </aside>
  );
}
export function AppTopbar() {
  const { data: avatars = [] } = useAvatars(),
    { data } = useWorkspace();
  const location = useLocation(),
    navigate = useNavigate();
  const user = useUI((s) => s.user),
    palette = useUI((s) => s.setPalette);
  const current = avatars.find((a) => location.pathname === `/avatars/${a.id}`);
  const session = data?.work.find((w) => w.status === 'Running');
  const action = useAction((operation: string) => studio.action(operation, { id: session?.id }));
  const tab = new URLSearchParams(location.search).get('tab') ?? 'Overview';
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <Link to="/avatars">
          {current ? 'Avatars' : location.pathname === '/settings' ? 'System' : 'Workspace'}
        </Link>
        <ChevronRight size={13} />
        <strong>
          {current?.name ??
            (location.pathname === '/' ? 'Overview' : location.pathname.split('/').at(-1))}
        </strong>
        {current && (
          <>
            <ChevronRight size={13} />
            <span>{tab === 'Changelog' ? 'Changes' : tab}</span>
          </>
        )}
      </div>
      <button className="topbar-search" onClick={() => palette(true)}>
        <Search size={14} />
        <span>Search or run a command</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="row topbar-status">
        {session && (
          <details className="action-menu">
            <summary className="session-pill">
              <Timer size={13} />
              {durationText(session.duration_seconds)}
            </summary>
            <div>
              <strong>{session.name}</strong>
              <p>{session.description}</p>
              <button onClick={() => action.mutate('session_pause')}>Pause session</button>
              <button onClick={() => action.mutate('session_stop')}>Stop session</button>
            </div>
          </details>
        )}
        <span
          className="status-dot"
          data-active={
            !!data?.presence?.presence && Date.now() / 1000 - data.presence.presence.at < 30
          }
          title="Unity Bridge presence"
        >
          Unity
        </span>
        <Link className="status-dot" data-active={!!user?.id} to="/settings">
          VRChat
        </Link>
        <button
          className="icon-button ghost"
          title="Needs attention"
          aria-label="Needs attention"
          onClick={() => navigate('/')}
        >
          <Bell size={16} />
        </button>
        <button
          className="account-button"
          title="Account settings"
          onClick={() => navigate('/settings')}
        >
          <AvatarImage name={user?.displayName ?? 'Local'} src={user?.imageUrl} />
        </button>
      </div>
    </header>
  );
}
export function StatusBar() {
  const updates = useUpdateStatus();
  const onlineUpdate = useOnlineUpdateStatus();
  const { data } = useWorkspace();
  const { data: avatars = [] } = useAvatars();
  const location = useLocation(),
    current = avatars.find((a) => location.pathname === `/avatars/${a.id}`);
  const info = data?.avatars.find((a) => a.id === current?.id);
  const user = useUI((s) => s.user);
  return (
    <footer className="statusbar">
      <span className="status-dot" data-active={!!user?.id}>
        {user?.id ? 'VRChat connected' : 'Local mode'}
      </span>
      <span>{current?.name ?? 'All projects'}</span>
      {current && (
        <>
          <span>v{current.custom_version}</span>
          <Link to={`?tab=Changelog`}>{info?.changes ?? 0} unreleased</Link>
          <Link to={`?tab=Bugs`}>{info?.bugs ?? 0} bugs</Link>
        </>
      )}
      {onlineUpdate.data?.available && (
        <Link to="/settings" className="update-available">
          Update {onlineUpdate.data.version} {onlineUpdate.data.ready ? 'ready' : 'available'}
        </Link>
      )}
      {!onlineUpdate.data?.available && updates.data?.available && (
        <Link to="/settings" className="update-available">
          Update {updates.data.release?.version} available
        </Link>
      )}
      <span className="statusbar-end">SQLite · Saved on this PC</span>
    </footer>
  );
}
