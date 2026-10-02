import { useState } from 'react';
import { Modal } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { useAction, useSettings } from '../../hooks/useVault';
import { repository } from '../../db/repository';
import {
  addVersionIncrement,
  nextSemanticVersion,
  validSemver,
  versionedName,
} from '../../utils/domain';
import { vrchat } from '../../api/VRChatApiClient';
import { useUI } from '../../stores/ui';
import type { Avatar, Change } from '../../types/domain';
export function ReleaseDialog({
  avatar,
  changes,
  onClose,
}: {
  avatar: Avatar;
  changes: Change[];
  onClose: () => void;
}) {
  const { data: settings = {} } = useSettings();
  const [mode, setMode] = useState<string | null>(null);
  const bump = mode ?? settings.releaseMode ?? 'increment';
  const [delta, setDelta] = useState<string | null>(null);
  const increment = delta ?? settings.releaseIncrement ?? '0.1.0';
  const [custom, setCustom] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState(changes.map((c) => c.id));
  const [renameRemote, setRenameRemote] = useState(false);
  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const user = useUI((s) => s.user);
  let version = '',
    error = '';
  try {
    version =
      savedVersion ??
      (bump === 'increment'
        ? addVersionIncrement(avatar.custom_version, increment)
        : bump === 'custom'
          ? custom
          : nextSemanticVersion(avatar.custom_version, bump as 'patch' | 'minor' | 'major'));
  } catch (e) {
    error = (e as Error).message;
  }
  const action = useAction(async () => {
    if (!savedVersion) {
      await repository.createRelease(avatar.id, version, title, notes, selected);
      setSavedVersion(version);
    }
    if (renameRemote && avatar.vrchat_id) {
      const data = await vrchat.renameAvatar(avatar.vrchat_id, versionedName(avatar.name, version));
      const current = (await repository.avatars()).find((a) => a.id === avatar.id);
      if (current) await repository.saveAvatar(data, current);
    }
    onClose();
  }, 'Release created');
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !action.isPending) onClose();
      }}
      title="Create release"
      description={`Current local version: v${avatar.custom_version}. VRChat version stays independent.`}
    >
      {savedVersion && (
        <p className="notice">
          Local release v{savedVersion} saved. Remote rename was not confirmed. Retry or close to
          keep the local release.
        </p>
      )}
      <fieldset
        disabled={!!savedVersion || action.isPending}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <div className="release-options">
          {['increment', 'patch', 'minor', 'major', 'custom'].map((v) => (
            <label key={v}>
              <input type="radio" checked={bump === v} onChange={() => setMode(v)} />
              <span>{v === 'custom' ? 'Exact version' : v}</span>
              <strong>
                {!['custom', 'increment'].includes(v)
                  ? 'v' +
                    nextSemanticVersion(avatar.custom_version, v as 'patch' | 'minor' | 'major')
                  : ''}
              </strong>
            </label>
          ))}
        </div>
        {bump === 'increment' && (
          <label>
            Increment to add
            <input
              value={increment}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="0.1.0"
            />
            <span className="muted version-result">
              v{avatar.custom_version} + {increment} →{' '}
              {version ? `v${version}` : 'Invalid increment'}
            </span>
            <span className="tiny muted version-help">
              Adds each number without resetting the others. Prerelease labels are removed.
            </span>
            {error && <span role="alert">{error}</span>}
          </label>
        )}
        {bump === 'custom' && (
          <label>
            Exact semantic version
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="1.0.0-beta.1"
            />
          </label>
        )}
        <label>
          Release title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A little more expressive"
          />
        </label>
        <label>
          Release notes
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <h4>Include unreleased changes · {selected.length}</h4>
        <div className="release-changes">
          {changes.map((c) => (
            <label className="check-row" key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id),
                  )
                }
              />
              {c.title}
            </label>
          ))}
        </div>
        <div className="panel release-preview">
          <span className="tiny muted version-help">NAME AFTER RELEASE</span>
          <h3>{versionedName(avatar.name, version || '…')}</h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={renameRemote}
              disabled={!avatar.vrchat_id || user?.id !== avatar.data.authorId}
              onChange={(e) => setRenameRemote(e.target.checked)}
            />
            Also rename this avatar on VRChat
          </label>
          <p className="tiny muted">
            Optional for each release. Only the name is sent to VRChat. Requires the owner's
            connected account.
          </p>
        </div>
      </fieldset>
      <div className="dialog-actions">
        <Button disabled={action.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="default"
          disabled={!validSemver(version) || action.isPending || !title.trim()}
          onClick={() => action.mutate()}
        >
          {savedVersion
            ? 'Retry VRChat rename'
            : `Create v${version}${renameRemote ? ' & rename on VRChat' : ''}`}
        </Button>
      </div>
    </Modal>
  );
}
