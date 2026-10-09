import { useState } from 'react';
import { useAction, useSettings } from '../hooks/useVault';
import { useLocale } from '../hooks/useLocale';
import { repository } from '../db/repository';
import { readCollections } from '../utils/library';
import { Button } from './ui/button';
export function LibraryCollections({
  active,
  onChange,
  selected,
}: {
  active: string;
  onChange: (id: string) => void;
  selected: string[];
}) {
  const { data: settings = {} } = useSettings();
  const { t } = useLocale();
  const collections = readCollections(settings.collections);
  const [name, setName] = useState('');
  const action = useAction(async (operation: { kind: string; id?: string }) => {
    // Read fresh settings before each write to preserve other collection edits.
    const current = readCollections((await repository.settings()).collections);
    if (operation.kind === 'create') {
      const title = name.trim();
      if (!title || title.length > 80)
        throw new Error(t('Use a collection name between 1 and 80 characters.'));
      if (current.some((c) => c.name.toLowerCase() === title.toLowerCase()))
        throw new Error(t('Collection already exists.'));
      const id = crypto.randomUUID();
      current.push({ id, name: title, avatarIds: [...selected] });
      await repository.setting('collections', JSON.stringify(current));
      setName('');
      onChange(id);
      return;
    }
    const group = current.find((c) => c.id === (operation.id ?? active));
    if (!group) throw new Error(t('Choose a collection first.'));
    if (operation.kind === 'rename') {
      const title = name.trim();
      if (!title || title.length > 80)
        throw new Error(t('Use a collection name between 1 and 80 characters.'));
      if (current.some((c) => c.id !== group.id && c.name.toLowerCase() === title.toLowerCase()))
        throw new Error(t('Collection already exists.'));
      group.name = title;
      setName('');
    }
    if (operation.kind === 'add') group.avatarIds = [...new Set([...group.avatarIds, ...selected])];
    if (operation.kind === 'remove')
      group.avatarIds = group.avatarIds.filter((id) => !selected.includes(id));
    await repository.setting('collections', JSON.stringify(current));
  });
  return (
    <details className="panel collection-controls">
      <summary>
        {t('Collections')} · {collections.length}
      </summary>
      <p className="muted tiny">
        {t('Organize by character, project or client. Avatars can belong to several collections.')}
      </p>
      <div className="row wrap">
        <select
          aria-label={t('Collections')}
          value={active}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t('All collections')}</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          aria-label={t('Collection name')}
          placeholder={t('Collection name')}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={action.isPending || !name.trim()}
          onClick={() => action.mutate({ kind: 'create' })}
        >
          {t('New collection')}
        </Button>
        <Button
          disabled={action.isPending || !active || !name.trim()}
          onClick={() => action.mutate({ kind: 'rename' })}
        >
          {t('Rename')}
        </Button>
      </div>
      {!!selected.length && (
        <div className="row wrap">
          <select
            aria-label={t('Add to collection')}
            value=""
            disabled={action.isPending}
            onChange={(e) => {
              if (e.target.value) action.mutate({ kind: 'add', id: e.target.value });
            }}
          >
            <option value="">
              {t('Add to collection')} · {selected.length}
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            disabled={action.isPending || !active}
            onClick={() => action.mutate({ kind: 'remove' })}
          >
            {t('Remove from collection')}
          </Button>
        </div>
      )}
    </details>
  );
}
