import { useOnline } from '../hooks/useOnline';
import { PerformancePanel } from '../features/avatars/PerformancePanel';
import { SnapshotTimeline } from '../features/studio/SnapshotTimeline';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspace } from '../components/workspace';
import { UnityPanel } from '../features/avatars/UnityPanel';
import { BugsPanel } from '../features/studio/BugsPanel';
import { WorkPanel } from '../features/studio/WorkPanel';
import { SnapshotInspector } from '../features/studio/SnapshotInspector';
import { ProjectHistory } from '../features/studio/ProjectHistory';
import { DependenciesPanel } from '../features/studio/DependenciesPanel';
import { UploadLinks } from '../features/studio/UploadLinks';
import { studio } from '../services/studio';
import { desktop } from '../db/bridge';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  RefreshCw,
  GitBranch,
  Star,
  Archive,
  Copy,
  Download,
  Link2,
  Trash2,
} from 'lucide-react';
import { useAction, useAvatars } from '../hooks/useVault';
import { repository } from '../db/repository';
import { vrchat } from '../api/VRChatApiClient';
import {
  AvatarImage,
  Badge,
  CopyButton,
  Empty,
  ErrorNotice,
  Loading,
  dateText,
} from '../components/common';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/dialog';
import { validateAvatarId } from '../utils/domain';
import { useAttachmentUrl } from '../services/files';
import { exportBackup } from '../services/backup';
import { refreshAvatar, type DetectedUpdate } from '../services/sync';
import type { Change, ChangeInput } from '../types/domain';
import { ChangeDialog } from '../features/changelogs/ChangeDialog';
import { ReleaseDialog } from '../features/changelogs/ReleaseDialog';
import { Timeline } from '../features/changelogs/Timeline';
import { DiffDialog } from '../features/snapshots/DiffDialog';
import { VersionsPanel } from '../features/snapshots/VersionsPanel';
import { NotesPanel } from '../features/avatars/NotesPanel';
import { AvatarBadges } from '../components/AvatarBadges';
import { JsonPanel } from '../features/avatars/JsonPanel';
import { TechnicalPanel } from '../features/avatars/TechnicalPanel';
import { OscPanel } from '../features/avatars/OscPanel';
import { ReleaseNotesPanel } from '../features/studio/ReleaseNotesPanel';
import { GalleryPanel } from '../features/avatars/GalleryPanel';
export function AvatarDetail() {
  const online = useOnline();
  const { id = '' } = useParams(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') ?? 'Overview';
  const tab = requestedTab === 'Development' ? 'Unity'
    : ['Parameters', 'FX', 'Performance'].includes(requestedTab) ? 'Inspectors' : requestedTab;
  const sections = [
    { name: 'Overview', tabs: ['Overview', 'Build performance', 'Technical', 'JSON', 'OSC'] },
    { name: 'Changes', tabs: ['Changelog'] },
    { name: 'Releases', tabs: ['Versions', 'Release notes'] },
    { name: 'Unity', tabs: ['Unity', 'Dependencies', 'Inspectors', 'Snapshots', 'Work'] },
    { name: 'Bugs', tabs: ['Bugs'] },
    { name: 'Notes', tabs: ['Notes'] },
    { name: 'Files', tabs: ['Files'] },
  ];
  const section = sections.find((s) => s.tabs.includes(tab)) ?? sections[0];
  const tabLabel = (value: string) => ({ Unity: 'Project', JSON: 'Raw JSON', Work: 'Work sessions', Technical: 'VRChat details' }[value] ?? value);
  const { data: workspace } = useWorkspace();
  const info = workspace?.avatars.find((a) => a.id === id);
  const { data: snapshots = [] } = useQuery({
    queryKey: ['studio-snapshots', id],
    queryFn: () => studio.snapshots(id),
  });
  const { data: avatars = [], isLoading, error } = useAvatars();
  const avatar = avatars.find((a) => a.id === id);
  useEffect(() => {
    if (!avatar) return;
    document.title = `VRC Avatar Vault — ${avatar.name}`;
    if (desktop)
      void getCurrentWindow()
        .setTitle(document.title)
        .catch(() => {});
    void repository.setting('lastAvatar', avatar.id);
    return () => {
      document.title = 'VRC Avatar Vault';
      if (desktop)
        void getCurrentWindow()
          .setTitle(document.title)
          .catch(() => {});
    };
  }, [avatar]);
  const cover = useAttachmentUrl(avatar?.local_cover_path);
  const { data: changes = [] } = useQuery({
      queryKey: ['changes', id],
      queryFn: () => repository.changes(id),
    }),
    { data: releases = [] } = useQuery({
      queryKey: ['releases', id],
      queryFn: () => repository.releases(id),
    });
  const [change, setChange] = useState<Change | 'new' | null>(null),
    [initial, setInitial] = useState<Partial<ChangeInput>>(),
    [release, setRelease] = useState(false),
    [diff, setDiff] = useState<DetectedUpdate | null>(null),
    [tag, setTag] = useState(''),
    [confirm, setConfirm] = useState<'delete' | 'link' | null>(null),
    [linkId, setLinkId] = useState('');
  const update = useAction(async (action: string) => {
    if (!avatar) return;
    if (action === 'work') await studio.action('session_start', { avatarId: id, description: '' });
    if (action === 'unity')
      await invoke('unity_project', { operation: 'open', avatarId: id, path: null });
    if (action === 'refresh') setDiff(await refreshAvatar(avatar));
    if (action === 'favorite')
      await repository.updateAvatar(id, { favorite: avatar.favorite ? 0 : 1 });
    if (action === 'archive')
      await repository.updateAvatar(id, { archived: avatar.archived ? 0 : 1 });
    if (action === 'fork') navigate(`/avatars/${await repository.fork(avatar)}`);
    if (action === 'export') await exportBackup([id]);
    if (action === 'delete') {
      await repository.removeAvatars([id]);
      navigate('/avatars');
    }
    if (action === 'link') {
      const data = await vrchat.getAvatar(linkId);
      await repository.saveAvatar(data, avatar);
      setConfirm(null);
    }
  });
  const tagAction = useAction(async () => {
    await repository.addTag([id], tag);
    setTag('');
  });
  const removeTag = useAction((tag: string) => repository.removeTag(id, tag));
  const auto = useRef(false);
  useEffect(() => {
    const action = params.get('action');
    if (action === 'change') setChange('new');
    if (action === 'release') setRelease(true);
    if (action) {
      const next = new URLSearchParams(params);
      next.delete('action');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);
  useEffect(() => {
    if (avatar && params.get('refresh') === '1' && !auto.current) {
      auto.current = true;
      update.mutate('refresh');
      setParams({});
    }
  }, [avatar, params, setParams, update]);
  useEffect(() => {
    function quick(e: Event) {
      const action = (e as CustomEvent<{ action: number }>).detail.action;
      if (action === 0) {
        setInitial(undefined);
        setChange('new');
      }
      if (action === 1) setRelease(true);
      if (action === 2) update.mutate('refresh');
      if (action === 3) setParams({ tab: 'Changelog' });
      if (action === 4) setParams({ tab: 'Snapshots' });
      if (action === 5) {
        update.mutate('work');
        setParams({ tab: 'Work' });
      }
      if (action === 6) {
        update.mutate('unity');
        setParams({ tab: 'Unity' });
      }
    }
    window.addEventListener('vault-quick-action', quick);
    return () => window.removeEventListener('vault-quick-action', quick);
  }, [update, setParams]);
  function newChange(values?: Partial<ChangeInput>) {
    setInitial(values);
    setChange('new');
  }
  if (isLoading) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!avatar)
    return (
      <Empty
        title="Avatar not found"
        description="This local tracker may have been deleted."
        action={<Button onClick={() => navigate('/avatars')}>Back to avatars</Button>}
      />
    );
  return (
    <>
      <div className="avatar-header">
        <AvatarImage src={cover ?? avatar.data.thumbnailImageUrl} name={avatar.name} />
        <div className="grow">
          <div className="row">
            <h1>{avatar.name}</h1>
            <button
              className={`star ${avatar.favorite ? 'active' : ''}`}
              title="Toggle favorite"
              aria-label="Toggle favorite"
              onClick={() => update.mutate('favorite')}
            >
              <Star size={16} />
            </button>
          </div>
          <div className="row wrap">
            <span className="version">v{avatar.custom_version}</span>
            <Badge>{avatar.data.releaseStatus}</Badge>
            <span className="muted">by {avatar.data.authorName}</span>
            {!!avatar.archived && <Badge>Archived</Badge>}
          </div>
          <div className="row tiny muted">
            <span>{avatar.vrchat_id ?? 'Local tracker'}</span>
            {avatar.vrchat_id && <CopyButton text={avatar.vrchat_id} label="Copy avatar ID" />}
            <span>Updated {dateText(avatar.updated_at)}</span>
          </div>
        </div>
      </div>
      <div className="detail-actions">
        <div className="row wrap">
          <Button variant="default" onClick={() => newChange()}>
            <Plus size={15} />
            Add Change
          </Button>
          <Button onClick={() => setRelease(true)}>
            <GitBranch size={15} />
            Create Release
          </Button>
          <Button
            disabled={!online || !avatar.vrchat_id || update.isPending}
            title={
              !online ? 'Offline: reconnect to refresh VRChat data' : 'Refresh VRChat metadata'
            }
            onClick={() => update.mutate('refresh')}
          >
            <RefreshCw size={15} className={update.isPending ? 'spin' : ''} />
            Refresh VRChat Data
          </Button>
        </div>
        <details className="action-menu">
          <summary className="button secondary">More actions</summary>
          <div>
            <Button onClick={() => update.mutate('archive')}>
              <Archive size={14} />
              {avatar.archived ? 'Restore' : 'Archive'}
            </Button>
            <Button onClick={() => update.mutate('fork')}>
              <Copy size={14} />
              Duplicate tracker
            </Button>
            <Button onClick={() => update.mutate('export')}>
              <Download size={14} />
              Export JSON
            </Button>
            {!avatar.vrchat_id && (
              <Button onClick={() => setConfirm('link')}>
                <Link2 size={14} />
                Link VRChat ID
              </Button>
            )}
            <Button variant="destructive" onClick={() => setConfirm('delete')}>
              <Trash2 size={14} />
              Delete local data
            </Button>
          </div>
        </details>
      </div>
      <div className="tabs" role="tablist" aria-label="Avatar sections">
        {sections.map((s) => (
          <button
            role="tab"
            aria-selected={section.name === s.name}
            key={s.name}
            className={section.name === s.name ? 'active' : ''}
            onClick={() => setParams({ tab: s.tabs[0] })}
          >
            {s.name}
            {s.name === 'Changes' && <span>{changes.length}</span>}
          </button>
        ))}
      </div>
      {section.tabs.length > 1 && (
        <nav className="section-navigation" aria-label={`${section.name} tools`}>
          {section.tabs.map((target) => (
            <button key={target} aria-current={tab === target ? 'page' : undefined}
              className={tab === target ? 'active' : ''}
              onClick={() => setParams({ tab: target })}>{tabLabel(target)}</button>
          ))}
        </nav>
      )}
      <div className="tab-content">
        {tab === 'Overview' && (
          <>
            <div className="workspace-columns">
              <section className="panel">
                <h2>Development</h2>
                <dl className="definition-grid">
                  <dt>Working version</dt>
                  <dd>v{avatar.custom_version}</dd>
                  <dt>Unity project</dt>
                  <dd>
                    <button className="text-button" onClick={() => setParams({ tab: 'Unity' })}>
                      {info?.project ? 'Project linked' : 'Link a project'}
                    </button>
                  </dd>
                  <dt>Unreleased</dt>
                  <dd>
                    <button className="text-button" onClick={() => setParams({ tab: 'Changelog' })}>
                      {info?.changes ?? 0} changes
                    </button>
                  </dd>
                  <dt>VRChat upload</dt>
                  <dd>API v{avatar.data.version}</dd>
                </dl>
              </section>
              <section className="panel">
                <h2>Needs attention</h2>
                {[
                  ['Bugs', `${info?.bugs ?? 0} open bugs`],
                  ['Snapshots', `${info?.files ?? 0} file batches to review`],
                  ['Notes', `${info?.tasks ?? 0} unfinished tasks`],
                ].map(([target, label]) => (
                  <button
                    key={target}
                    className="attention-row"
                    onClick={() => setParams({ tab: target })}
                  >
                    <span className="attention-dot" />
                    {label}
                  </button>
                ))}
              </section>
              <section className="panel">
                <h2>Recent changes</h2>
                {changes.slice(0, 5).map((c) => (
                  <button key={c.id} className="feed-line" onClick={() => setChange(c)}>
                    <span className="category-label" data-category={c.categories[0]}>
                      {c.categories[0]}
                    </span>
                    <span>{c.title}</span>
                  </button>
                ))}
                {!changes.length && (
                  <p className="muted">No changes yet. Add your first change above.</p>
                )}
              </section>
              <section className="panel">
                <h2>Platform performance</h2>
                <button className="text-button" onClick={() => setParams({ tab: 'Build performance' })}>View uploaded build performance →</button>
                <div className="performance-summary">
                  <AvatarBadges avatar={avatar} />
                </div>
                <button className="text-button" onClick={() => setParams({ tab: 'Performance' })}>
                  Inspect performance history →
                </button>
              </section>
            </div>
            <div className="detail-columns">
              <section className="panel">
                <h2>About this avatar</h2>
                <p className="preserve-lines muted">
                  {avatar.data.description || 'No description provided by VRChat.'}
                </p>
                <dl className="definition-grid">
                  <dt>Avatar ID</dt>
                  <dd className="break-all">
                    {avatar.vrchat_id ?? 'Not linked'}{' '}
                    {avatar.vrchat_id && <CopyButton text={avatar.vrchat_id} label="Copy ID" />}
                  </dd>
                  <dt>Created on VRChat</dt>
                  <dd>{dateText(avatar.data.created_at)}</dd>
                  <dt>Last VRChat update</dt>
                  <dd>{dateText(avatar.data.updated_at)}</dd>
                  <dt>Last local change</dt>
                  <dd>{dateText(avatar.updated_at)}</dd>
                  <dt>Metadata refreshed</dt>
                  <dd>{dateText(avatar.last_api_refresh_at)}</dd>
                </dl>
              </section>
              <section className="panel">
                <h2>Personal tags</h2>
                <p className="muted">Your organization, independent of VRChat tags.</p>
                <div className="row wrap">
                  {avatar.tags.map((t) => (
                    <button
                      key={t}
                      className="badge purple"
                      title={`Remove ${t}`}
                      onClick={() => removeTag.mutate(t)}
                    >
                      {t} ×
                    </button>
                  ))}
                </div>
                <form
                  className="row tag-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    tagAction.mutate();
                  }}
                >
                  <input
                    aria-label="New personal tag"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="Add a tag…"
                  />
                  <Button aria-label="Add personal tag" disabled={!tag.trim()}>
                    <Plus size={14} />
                  </Button>
                </form>
                <h3>Latest change</h3>
                <p>{changes[0]?.title ?? 'No changes recorded yet.'}</p>
                <Button size="sm" onClick={() => setParams({ tab: 'Notes' })}>
                  Open notes & tasks
                </Button>
              </section>
            </div>
          </>
        )}
        {tab === 'Changelog' && (
          <Timeline
            avatarId={id}
            name={avatar.name}
            changes={changes}
            releases={releases}
            onEdit={setChange}
          />
        )}
        {tab === 'Versions' && (
          <VersionsPanel avatarId={id} releases={releases} changes={changes} />
        )}
        {tab === 'Bugs' && <BugsPanel avatarId={id} version={avatar.custom_version} />}
        {tab === 'Unity' && <UnityPanel avatarId={id} />}
        {tab === 'Work' && <WorkPanel avatarId={id} />}
        {tab === 'Dependencies' && <DependenciesPanel avatarId={id} />}
        {tab === 'Inspectors' && (
          <SnapshotInspector key={requestedTab} avatar={avatar} snapshots={snapshots}
            initialTab={['Parameters', 'FX', 'Performance'].includes(requestedTab) ? requestedTab : 'Parameters'} />
        )}
        {tab === 'Snapshots' && (
          <>
            <SnapshotTimeline avatarId={id} snapshots={snapshots} />
            <ProjectHistory avatarId={id} snapshots={snapshots} />
            <UploadLinks avatarId={id} />
          </>
        )}
        {tab === 'Build performance' && <PerformancePanel key={avatar.id} avatar={avatar} />}
        {tab === 'Technical' && <TechnicalPanel avatar={avatar} />}
        {tab === 'JSON' && <JsonPanel avatar={avatar} />}
        {tab === 'OSC' && <OscPanel avatar={avatar} />}
        {tab === 'Release notes' && <ReleaseNotesPanel avatarId={id} />}
        {tab === 'Notes' && (
          <NotesPanel
            key={id}
            avatar={avatar}
            onConvert={(t) => newChange({ title: t.title, categories: ['Fixed'] })}
          />
        )}
        {tab === 'Files' && <GalleryPanel avatar={avatar} changes={changes} />}
      </div>
      {change && (
        <ChangeDialog
          key={change === 'new' ? 'new' : change.id}
          avatarId={id}
          entry={change === 'new' ? undefined : change}
          releases={releases}
          initial={initial}
          onClose={() => {
            setChange(null);
            setInitial(undefined);
          }}
        />
      )}
      {release && (
        <ReleaseDialog
          avatar={avatar}
          changes={changes.filter((c) => !c.release_id)}
          onClose={() => setRelease(false)}
        />
      )}
      {diff && (
        <DiffDialog
          title="Detected changes from VRChat"
          differences={diff.differences}
          onClose={() => setDiff(null)}
          onSave={() => {
            newChange({
              title: 'VRChat metadata updated',
              description: diff.differences
                .map(
                  (d) =>
                    `${d.field}: ${JSON.stringify(d.oldValue)} → ${JSON.stringify(d.newValue)}`,
                )
                .join('\n'),
              categories: ['Changed'],
            });
            setDiff(null);
          }}
        />
      )}
      <Modal
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
        title={confirm === 'delete' ? 'Delete local tracker?' : 'Link this tracker to VRChat'}
        description={
          confirm === 'delete'
            ? 'This permanently deletes local history. The VRChat avatar will not be changed. Export a backup first if needed.'
            : 'Enter a different Avatar ID. Duplicate linked IDs are rejected.'
        }
      >
        {confirm === 'link' && (
          <label>
            Avatar ID
            <input value={linkId} onChange={(e) => setLinkId(e.target.value)} />
          </label>
        )}
        <div className="dialog-actions">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant={confirm === 'delete' ? 'destructive' : 'default'}
            disabled={update.isPending || (confirm === 'link' && !validateAvatarId(linkId))}
            onClick={() => update.mutate(confirm ?? '')}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}
