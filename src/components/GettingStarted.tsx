import { useNavigate } from 'react-router-dom';
import { useUI } from '../stores/ui';
import { useAvatars, useSettings, useAction } from '../hooks/useVault';
import { useWorkspace } from './workspace';
import { useLocale } from '../hooks/useLocale';
import { repository } from '../db/repository';
import { Button } from './ui/button';
export function GettingStarted() {
  const { t } = useLocale();
  const { data: settings = {} } = useSettings();
  const { data: avatars = [] } = useAvatars();
  const { data: workspace } = useWorkspace();
  const user = useUI((s) => s.user);
  const setImport = useUI((s) => s.setImport);
  const navigate = useNavigate();
  const dismiss = useAction(() => repository.setting('setupDismissed', 'true'));
  if (settings.onboarded !== 'true' || settings.setupDismissed === 'true') return null;
  const imported = avatars.find((a) => !a.archived);
  const linked = workspace?.avatars.some((a) => a.project);
  return (
    <section className="panel setup-guide">
      <div className="row between">
        <h2>{t('Getting started')}</h2>
        <Button size="sm" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          {t(linked ? 'Done' : 'Later')}
        </Button>
      </div>
      <div className="setup-steps">
        <Button onClick={() => navigate('/settings')}>
          <span>{user?.id ? '✓' : '1'}</span>
          {t('Connect VRChat')}
        </Button>
        <Button disabled={!user?.id} onClick={() => setImport(true)}>
          <span>{imported ? '✓' : '2'}</span>
          {t('Import Avatar')}
        </Button>
        <Button
          disabled={!imported}
          onClick={() => imported && navigate(`/avatars/${imported.id}?tab=Unity`)}
        >
          <span>{linked ? '✓' : '3'}</span>
          {t('Link a VCC project')}
        </Button>
      </div>
    </section>
  );
}
