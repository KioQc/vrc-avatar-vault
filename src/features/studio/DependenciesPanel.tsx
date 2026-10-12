import { Modal } from '../../components/ui/dialog';
import { UnityPanel } from '../avatars/UnityPanel';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query, execute, statement as s } from '../../db/bridge';
import { uid } from '../../db/repository';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
const emptyDependency = {
  name: '',
  version: '',
  type: 'Local Asset',
  source: 'Manual',
  url: '',
  installed_path: '',
  notes: '',
};
const fieldLabels: Record<string, string> = {
  name: 'Name',
  version: 'Version',
  type: 'Type',
  source: 'Source',
  url: 'Documentation / download URL',
  installed_path: 'Installed path',
  notes: 'Notes',
};
export function DependenciesPanel({ avatarId }: { avatarId: string }) {
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Record<string, string> | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState({ ...emptyDependency });
  const data = useQuery({
    queryKey: ['manual-dependencies', avatarId],
    queryFn: () =>
      query<typeof draft & { id: string }>(
        'SELECT * FROM manual_dependencies WHERE avatar_id=?',
        avatarId,
      ),
  });
  const add = useAction(async () => {
    if (!draft.name.trim()) throw new Error('Dependency name required');
    await execute([
      s(
        'INSERT INTO manual_dependencies VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=excluded.version,type=excluded.type,source=excluded.source,url=excluded.url,installed_path=excluded.installed_path,notes=excluded.notes WHERE avatar_id=excluded.avatar_id',
        editing ?? uid(),
        avatarId,
        draft.name.trim(),
        draft.version,
        draft.type,
        draft.source,
        draft.url,
        draft.installed_path,
        draft.notes,
      ),
    ]);
    setDraft({ ...emptyDependency });
    setEditing(null);
    setAdding(false);
  });
  const remove = useAction((id: string) =>
    execute([s('DELETE FROM manual_dependencies WHERE id=? AND avatar_id=?', id, avatarId)]),
  );
  return (
    <>
      <details className="panel">
        <summary>Detected Unity packages</summary>
        <UnityPanel avatarId={avatarId} />
      </details>
      <section className="panel">
        <h2>Manual dependencies</h2>
        <p className="muted">
          Record assets such as shaders or templates that are not declared in package manifests.
        </p>
        <div className="row wrap">
          <Button
            onClick={() => {
              setEditing(null);
              setDraft({ ...emptyDependency });
              setAdding(true);
            }}
          >
            Add dependency
          </Button>
          <input
            aria-label="Search manual dependencies"
            placeholder="Search name, notes or source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Modal
          drawer
          open={adding}
          onOpenChange={setAdding}
          title={editing ? 'Edit dependency' : 'Add dependency'}
          description="Record a local asset or external package."
        >
          <div className="form-grid">
            {Object.keys(draft).map((key) => (
              <label key={key}>
                {fieldLabels[key]}
                <input
                  value={draft[key as keyof typeof draft]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <Button disabled={!draft.name.trim() || add.isPending} onClick={() => add.mutate()}>
            {editing ? 'Save changes' : 'Add dependency'}
          </Button>
        </Modal>
        {data.data
          ?.filter((d) =>
            `${d.name} ${d.source} ${d.notes}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((d) => (
            <button key={d.id} className="feed-line" onClick={() => setSelected(d)}>
              <strong>{d.name}</strong>
              <span>{d.version || 'Unknown'}</span>
              <span className="muted">{d.type}</span>
            </button>
          ))}
        <Modal
          drawer
          open={!!selected}
          onOpenChange={(v) => {
            if (!v) setSelected(null);
          }}
          title={selected?.name ?? 'Dependency'}
          description="Local dependency details"
        >
          {selected && (
            <>
              <dl className="definition-grid">
                {Object.entries(selected)
                  .filter(([k]) => k !== 'id' && k !== 'avatar_id')
                  .map(([k, v]) => (
                    <div key={k} className="descriptor-property">
                      <dt>{k.replace('_', ' ')}</dt>
                      <dd>{v || 'Not recorded'}</dd>
                    </div>
                  ))}
              </dl>
              <Button
                onClick={() => {
                  setEditing(selected.id);
                  setDraft(
                    Object.fromEntries(
                      Object.keys(emptyDependency).map((k) => [k, selected[k] ?? '']),
                    ) as typeof emptyDependency,
                  );
                  setSelected(null);
                  setAdding(true);
                }}
              >
                Edit dependency
              </Button>
              <Button
                onClick={() => {
                  if (
                    window.confirm('Remove this dependency record? Project files remain unchanged.')
                  ) {
                    remove.mutate(selected.id);
                    setSelected(null);
                  }
                }}
              >
                Remove record
              </Button>
            </>
          )}
        </Modal>
      </section>
    </>
  );
}
