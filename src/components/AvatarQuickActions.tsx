import { invoke } from '@tauri-apps/api/core';
import { useAction, useSettings } from '../hooks/useVault';
import { useLocale } from '../hooks/useLocale';
import { useOnline } from '../hooks/useOnline';
import { desktop, mockMode } from '../db/bridge';
import { refreshAvatar } from '../services/sync';
import type { Avatar } from '../types/domain';
import { CopyButton, ErrorNotice, timeAgo } from './common';
import { Button } from './ui/button';
export function AvatarQuickActions({
  avatar,
  projectLinked = false,
}: {
  avatar: Avatar;
  projectLinked?: boolean;
}) {
  const { t } = useLocale();
  const { data: settings = {} } = useSettings();
  const online = useOnline();
  const action = useAction(async (kind: string) => {
    if (kind === 'refresh') {
      const result = await refreshAvatar(avatar);
      if (result.differences.length)
        window.dispatchEvent(new CustomEvent('vault-detected', { detail: result }));
    }
    if (kind === 'vcc')
      await invoke('unity_project', { operation: 'open', avatarId: avatar.id, path: null });
    if (kind === 'web' && avatar.vrchat_id) {
      if (desktop && !mockMode) await invoke('open_avatar_page', { id: avatar.vrchat_id });
      else
        window.open(
          `https://vrchat.com/home/avatar/${avatar.vrchat_id}`,
          '_blank',
          'noopener,noreferrer',
        );
    }
  });
  const refreshedAt = avatar.last_api_refresh_at ? Date.parse(avatar.last_api_refresh_at) : NaN;
  const stale =
    !Number.isFinite(refreshedAt) || Date.now() - refreshedAt > Number(settings.ttl ?? 15) * 60000;
  return (
    <div className="avatar-quick-actions">
      <div className="row wrap tiny">
        <span className={`sync-indicator ${stale ? 'stale' : ''}`}>
          {t(
            !avatar.last_api_refresh_at
              ? 'Never synced'
              : stale
                ? 'Refresh recommended'
                : 'Up to date',
          )}
        </span>
        {avatar.last_api_refresh_at && (
          <time dateTime={avatar.last_api_refresh_at} title={avatar.last_api_refresh_at}>
            {timeAgo(avatar.last_api_refresh_at)}
          </time>
        )}
        <Button
          size="sm"
          disabled={!online || !avatar.vrchat_id || action.isPending}
          onClick={() => action.mutate('refresh')}
        >
          {t(action.error && action.variables === 'refresh' ? 'Retry' : 'Refresh')}
        </Button>
      </div>
      <div className="row wrap">
        {avatar.vrchat_id && (
          <>
            <CopyButton text={avatar.vrchat_id} label={t('Copy ID')} />
            <Button size="sm" disabled={action.isPending} onClick={() => action.mutate('web')}>
              {t('Open on VRChat')}
            </Button>
          </>
        )}
        <Button
          size="sm"
          disabled={!projectLinked || !desktop || mockMode || action.isPending}
          title={projectLinked ? t('Open via VCC') : t('Link a VCC project')}
          onClick={() => action.mutate('vcc')}
        >
          {t('Open via VCC')}
        </Button>
      </div>
      {action.error && <ErrorNotice error={action.error} />}
    </div>
  );
}
