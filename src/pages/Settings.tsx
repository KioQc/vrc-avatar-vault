import { Diagnostics } from '../features/updates/Diagnostics';
import { Participation } from '../features/updates/Participation';
import { AISettings } from '../features/studio/AISettings';
import { openCommunity, COMMUNITY_URL } from '../services/community';
import { UpdateCenter } from '../features/updates/UpdateCenter';
import { OnlineUpdateCenter } from '../features/updates/OnlineUpdateCenter';
import { version as appVersion } from '../../package.json';
import { IntegrationSettings } from '../features/studio/IntegrationSettings';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { Download, FolderOpen, Upload } from 'lucide-react';
import { FolderSettings } from '../features/vrchat/FolderSettings';
import { addVersionIncrement } from '../utils/domain';
import { AccountPanel } from '../features/vrchat/AccountPanel';
import { useAction, useSettings } from '../hooks/useVault';
import { repository } from '../db/repository';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/dialog';
import { exportBackup, readBackup, restoreBackup, type Backup } from '../services/backup';
import { openFolder } from '../services/files';
import { vrchat } from '../api/VRChatApiClient';
import { desktop, mockMode } from '../db/bridge';
export function Settings() {
  const { data: settings = {} } = useSettings();
  const [incrementDraft, setIncrementDraft] = useState<string | null>(null);
  const increment = incrementDraft ?? settings.releaseIncrement ?? '0.1.0';
  let incrementValid = false;
  try {
    addVersionIncrement('1.0.0', increment);
    incrementValid = true;
  } catch {
    /* Inline validation below */
  }
  const [backup, setBackup] = useState<Backup | null>(null);
  const setting = useAction(({ key, value }: { key: string; value: string }) =>
    repository.setting(key, value),
  );
  const save = (key: string, value: string) => setting.mutate({ key, value });
  const { data: storage } = useQuery({
    queryKey: ['storage'],
    queryFn: () => invoke<{ database: string; attachments: string }>('storage_info'),
    enabled: desktop && !mockMode,
  });
  const action = useAction(async (kind: string) => {
    if (kind === 'export') await exportBackup();
    if (kind === 'community') await openCommunity();
    if (kind === 'import') setBackup(await readBackup());
    if (kind === 'restore' && backup) {
      await restoreBackup(backup);
      setBackup(null);
    }
    if (kind === 'logs' || kind === 'backups' || kind === 'data') await openFolder(kind);
    if (kind === 'clear') {
      vrchat.clearCache();
    }
    if (kind === 'reset') {
      await Promise.all([
        repository.setting('accent', '#a78bfa'),
        repository.setting('theme', 'dark'),
        repository.setting('dateFormat', 'friendly'),
      ]);
    }
  }, 'Action completed');
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Make this workspace your own.</p>
        </div>
      </div>
      <nav className="settings-nav">
        <a
          href="#/settings"
          onClick={(e) => {
            e.preventDefault();
            document.querySelector('.settings-stack')?.scrollIntoView();
          }}
        >
          Appearance
        </a>
        <a
          href="#/settings"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('settings-publishing')?.scrollIntoView();
          }}
        >
          Publishing
        </a>
        <a
          href="#/settings"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('settings-integrations')?.scrollIntoView();
          }}
        >
          Integrations & folders
        </a>
      </nav>
      <div className="settings-stack">
        <section className="panel">
          <h2>Communauté et support</h2>
          <p>
            Rejoins le Discord VAV pour les annonces, les patch notes, l’entraide et les
            suggestions. Le serveur est actuellement francophone.
          </p>
          <Button onClick={() => action.mutate('community')} disabled={action.isPending}>
            Ouvrir le Discord VAV
          </Button>
          <p className="tiny muted">{COMMUNITY_URL}</p>
        </section>
        <OnlineUpdateCenter />
        <Diagnostics />
        <Participation />
        <details className="panel">
          <summary>Manual update from a local folder</summary>
          <UpdateCenter />
        </details>
        <section className="panel">
          <h2>Appearance</h2>
          {[
            ['density', 'Density', ['compact', 'comfortable']],
            ['sidebar', 'Sidebar', ['expanded', 'compact']],
            ['reduceMotion', 'Reduce animations', ['false', 'true']],
          ].map(([key, title, options]) => (
            <div className="settings-row" key={key as string}>
              <strong>{title}</strong>
              <select
                aria-label={title as string}
                value={settings[key as string] ?? (options as string[])[0]}
                onChange={(e) => save(key as string, e.target.value)}
              >
                {(options as string[]).map((o) => (
                  <option key={o} value={o}>
                    {o === 'true' ? 'On' : o === 'false' ? 'Off' : o}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="settings-row">
            <div>
              <strong>Theme</strong>
              <p>Appearance of your vault.</p>
            </div>
            <select
              aria-label="Theme"
              value={settings.theme ?? 'dark'}
              onChange={(e) => save('theme', e.target.value)}
            >
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <strong>Accent color</strong>
              <p>A little personality.</p>
            </div>
            <input
              className="color-input"
              aria-label="Accent color"
              type="color"
              value={settings.accent ?? '#a78bfa'}
              onChange={(e) => save('accent', e.target.value)}
            />
          </div>
          <div className="row accent-presets">
            {[
              ['Purple', '#a78bfa'],
              ['Blue', '#7aa2f7'],
              ['Green', '#7bb699'],
              ['Orange', '#d9ad67'],
            ].map(([label, color]) => (
              <Button key={label} onClick={() => save('accent', color)}>
                {label}
              </Button>
            ))}
          </div>
          <div className="settings-row">
            <div>
              <strong>Date format</strong>
              <p>Dates throughout the application.</p>
            </div>
            <select
              aria-label="Date format"
              value={settings.dateFormat ?? 'friendly'}
              onChange={(e) => save('dateFormat', e.target.value)}
            >
              <option value="friendly">Sep 29, 2026</option>
              <option value="iso">2026-09-29</option>
            </select>
          </div>
        </section>
        <section className="panel">
          <h2 id="settings-publishing">Publishing defaults</h2>
          <div className="settings-row">
            <div>
              <strong>Version calculation</strong>
              <p>
                Applied to new release dialogs. Remote VRChat renaming remains optional for every
                release.
              </p>
            </div>
            <select
              aria-label="Default version mode"
              value={settings.releaseMode ?? 'increment'}
              onChange={(e) => save('releaseMode', e.target.value)}
            >
              <option value="increment">Add an increment</option>
              <option value="patch">SemVer patch</option>
              <option value="minor">SemVer minor (reset patch)</option>
              <option value="major">SemVer major (reset minor/patch)</option>
              <option value="custom">Exact version</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <strong>Default increment</strong>
              <p>Example: 1.0.0 + 0.1.0 = 1.1.0, then 1.2.0.</p>
            </div>
            <div className="row">
              <input
                aria-label="Default increment"
                value={increment}
                onChange={(e) => setIncrementDraft(e.target.value)}
                placeholder="0.1.0"
              />
              <Button
                disabled={!incrementValid || setting.isPending}
                onClick={() => save('releaseIncrement', increment)}
              >
                Save
              </Button>
            </div>
          </div>
          {!incrementValid && (
            <p role="alert">Enter a positive increment such as 0.0.1, 0.1.0 or 1.0.0.</p>
          )}
        </section>
        <FolderSettings />
        <IntegrationSettings />
        <AISettings />
        <div id="settings-integrations">
          <AccountPanel />
        </div>
        <section className="panel">
          <h2>VRChat sync</h2>
          <div className="settings-row">
            <div>
              <strong>Automatic metadata refresh</strong>
              <p>
                Checks tracked, non-archived avatars while this app is open and connected. New
                uploads update metadata and create a snapshot when changes are detected.
              </p>
            </div>
            <select
              aria-label="Sync interval"
              value={settings.sync ?? 'startup'}
              onChange={(e) => save('sync', e.target.value)}
            >
              <option value="off">Off</option>
              <option value="startup">On startup</option>
              <option value="30s">Every 30 seconds (live uploads)</option>
              <option value="1">Every 1 hour</option>
              <option value="6">Every 6 hours</option>
              <option value="24">Daily</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <strong>Cache duration</strong>
              <p>
                Minimum metadata age before automatic refresh. The 30-second mode overrides this
                cache duration. Requests are sequential; network errors and rate limits delay
                retries.
              </p>
            </div>
            <select
              aria-label="Cache duration"
              value={settings.ttl ?? '15'}
              onChange={(e) => save('ttl', e.target.value)}
            >
              {[5, 15, 30, 60, 360].map((v) => (
                <option key={v} value={String(v)}>
                  {v} minutes
                </option>
              ))}
            </select>
          </div>
        </section>
        <section className="panel">
          <h2>Storage & backup</h2>
          <p className="notice">
            Your vault lives on this PC, outside the installation folder. Updating or replacing the
            application keeps your avatars, notes, releases and images. A verified database backup
            is created before opening a new app version.
          </p>
          <p className="muted">
            Versioned JSON backups include local history and attached images. Restoring a full vault
            replaces its data after a safety backup.
          </p>
          <dl className="definition-grid">
            <dt>Database</dt>
            <dd>{storage?.database ?? 'Desktop app data directory'}</dd>
            <dt>Attachments</dt>
            <dd>{storage?.attachments ?? 'Desktop app data directory / attachments'}</dd>
          </dl>
          <div className="row wrap">
            <Button onClick={() => action.mutate('data')}>
              <FolderOpen size={14} />
              Open data folder
            </Button>
            <Button disabled={action.isPending} onClick={() => action.mutate('export')}>
              <Download size={14} />
              Export database backup
            </Button>
            <Button disabled={action.isPending} onClick={() => action.mutate('import')}>
              <Upload size={14} />
              Restore / import backup
            </Button>
            <Button onClick={() => action.mutate('backups')}>
              <FolderOpen size={14} />
              Safety backups
            </Button>
          </div>
        </section>
        <section className="panel">
          <h2>Advanced</h2>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.debug === 'true'}
              onChange={(e) => save('debug', String(e.target.checked))}
            />
            Enable diagnostic event logging
          </label>
          <p className="tiny muted">
            Only fixed event names and timestamps are logged. No credentials, payloads or cookies.
          </p>
          <div className="row wrap">
            <Button onClick={() => action.mutate('logs')}>Open logs folder</Button>
            <Button onClick={() => action.mutate('clear')}>Clear API cache</Button>
            <Button onClick={() => action.mutate('reset')}>Reset UI settings</Button>
          </div>
        </section>
        <p className="tiny muted">
          VRC Avatar Vault {appVersion} · Local first · Community API integration
        </p>
      </div>
      <Modal
        open={!!backup}
        onOpenChange={(v) => {
          if (!v) setBackup(null);
        }}
        title={backup?.scope === 'avatar' ? 'Import avatar backup?' : 'Restore full vault backup?'}
        description={
          backup?.scope === 'avatar'
            ? 'Duplicate IDs cause the whole import to be rejected. Existing trackers are preserved.'
            : 'Current local data will be replaced. A SQLite safety backup is created automatically first.'
        }
      >
        <p>
          {backup?.tables.avatars.length} avatars · {backup?.tables.changelog_entries.length}{' '}
          changes · {Object.keys(backup?.files ?? {}).length} images
        </p>
        <div className="dialog-actions">
          <Button onClick={() => setBackup(null)}>Cancel</Button>
          <Button
            variant="default"
            disabled={action.isPending}
            onClick={() => action.mutate('restore')}
          >
            Create safety backup & restore
          </Button>
        </div>
      </Modal>
    </>
  );
}
