import { ContextMenu } from './ui/context-menu';
import { studio } from '../services/studio';
import { invoke } from '@tauri-apps/api/core';
import { Link, useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { Avatar } from '../types/domain';
import { AvatarImage, Badge, timeAgo } from './common';
import { platforms } from '../utils/domain';
import { useAction, useFavorite } from '../hooks/useVault';
import { repository } from '../db/repository';
import { useAttachmentUrl } from '../services/files';
export function AvatarCard({
  avatar,
  selected,
  onSelect,
}: {
  avatar: Avatar;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const navigate = useNavigate();
  const contextAction = useAction(async (kind: string) => {
    if (kind === 'archive')
      await repository.updateAvatar(avatar.id, { archived: avatar.archived ? 0 : 1 });
    if (kind === 'work')
      await studio.action('session_start', { avatarId: avatar.id, description: '' });
    if (kind === 'unity')
      await invoke('unity_project', { operation: 'open', avatarId: avatar.id, path: null });
  });
  const favorite = useFavorite(avatar);
  const cover = useAttachmentUrl(avatar.local_cover_path);
  return (
    <ContextMenu
      actions={[
        { label: 'Open', run: () => navigate(`/avatars/${avatar.id}`) },
        { label: 'Add change', run: () => navigate(`/avatars/${avatar.id}?action=change`) },
        { label: 'Create snapshot', run: () => navigate(`/avatars/${avatar.id}?tab=Snapshots`) },
        { label: 'Start session', run: () => contextAction.mutate('work') },
        { label: 'Open Unity project', run: () => contextAction.mutate('unity') },
        {
          label: 'Refresh VRChat data',
          run: () => navigate(`/avatars/${avatar.id}?refresh=1`),
          disabled: !navigator.onLine || !avatar.vrchat_id,
        },
        { label: avatar.favorite ? 'Remove favorite' : 'Favorite', run: () => favorite.mutate() },
        {
          label: avatar.archived ? 'Restore' : 'Archive',
          run: () => contextAction.mutate('archive'),
        },
      ]}
    >
      <article className={`avatar-card ${selected ? 'selected' : ''}`}>
        <Link to={`/avatars/${avatar.id}`} className="card-image-link">
          <AvatarImage name={avatar.name} src={cover ?? avatar.data.thumbnailImageUrl} />
          <span className="image-status">
            <Badge>{avatar.vrchat_id ? avatar.data.releaseStatus : 'Unlinked tracker'}</Badge>
          </span>
        </Link>
        <div className="card-quick">
          <Link to={`/avatars/${avatar.id}`}>Open</Link>
          <Link to={`/avatars/${avatar.id}?action=change`}>Add change</Link>
          <Link to={`/avatars/${avatar.id}?tab=Unity`}>Unity</Link>
        </div>
        <div className="card-body">
          <div className="row between">
            <Link className="card-title" to={`/avatars/${avatar.id}`}>
              {avatar.name}
            </Link>
            <button
              className={`star ${avatar.favorite ? 'active' : ''}`}
              aria-label={avatar.favorite ? 'Remove favorite' : 'Add favorite'}
              title="Favorite"
              onClick={() => favorite.mutate()}
            >
              <Star size={16} fill={avatar.favorite ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="row muted">
            <span className="version">v{avatar.custom_version}</span>
            <span>VRChat {avatar.data.version}</span>
          </div>
          <div className="row between card-footer">
            <div className="row">
              {platforms(avatar.data).map((p) => (
                <Badge key={p}>{p}</Badge>
              ))}
            </div>
            {onSelect && (
              <input
                aria-label={`Select ${avatar.name}`}
                type="checkbox"
                checked={!!selected}
                onChange={(e) => onSelect(e.target.checked)}
              />
            )}
          </div>
          <p className="tiny muted">Updated {timeAgo(avatar.updated_at)}</p>
        </div>
      </article>
    </ContextMenu>
  );
}
