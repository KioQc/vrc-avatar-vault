import { Modal } from '../../components/ui/dialog';
import { UnityPanel } from '../avatars/UnityPanel';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query, execute, statement as s } from '../../db/bridge';
import { uid } from '../../db/repository';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
export function DependenciesPanel({ avatarId }: { avatarId: string }) {
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    version: '',
    type: 'Local Asset',
    source: 'Manual',
    url: '',
    installed_path: '',
    notes: '',
  });
  const data = useQuery({
    queryKey: ['manual-dependencies', avatarId],
    queryFn: () =>
      query<typeof draft & { id: string }>(
        'SELECT * FROM manual_dependencies WHERE avatar_id=?',
        avatarId,
      ),
  });
  const add = useAction(async () => {
    await execute([
      s(
        'INSERT INTO manual_dependencies VALUES(?,?,?,?,?,?,?,?,?)',
        uid(),
        avatarId,
        draft.name,
        draft.version,
        draft.type,
        draft.source,
        draft.url,
        draft.installed_path,
        draft.notes,
      ),
    ]);
    setDraft({ ...draft, name: '', version: '', notes: '' });
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
        <Button onClick={() => setAdding(true)}>Add dependency</Button>
        <Modal
          drawer
          open={adding}
          onOpenChange={setAdding}
          title="Add dependency"
          description="Record a local asset or external package."
        >
          <div className="form-grid">
            {Object.keys(draft).map((key) => (
              <label key={key}>
                {key}
                <input
                  value={draft[key as keyof typeof draft]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <Button disabled={!draft.name.trim() || add.isPending} onClick={() => add.mutate()}>
            Add dependency
          </Button>
        </Modal>
        {data.data?.map((d) => (
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
