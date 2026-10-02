import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import {
  changeSchema,
  categories,
  type Change,
  type ChangeInput,
  type Release,
} from '../../types/domain';
import { useAction } from '../../hooks/useVault';
import { repository } from '../../db/repository';
export function ChangeDialog({
  avatarId,
  onClose,
  entry,
  releases = [],
  initial,
}: {
  avatarId: string;
  onClose: () => void;
  entry?: Change;
  releases?: Release[];
  initial?: Partial<ChangeInput>;
}) {
  const form = useForm<ChangeInput>({
    resolver: zodResolver(changeSchema),
    defaultValues: entry
      ? {
          ...entry,
          created_at: new Date(
            new Date(entry.created_at).getTime() -
              new Date(entry.created_at).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16),
        }
      : {
          title: '',
          description: '',
          categories: ['Changed'],
          importance: 'Normal',
          platform: 'All',
          release_id: null,
          created_at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16),
          ...initial,
        },
  });
  const action = useAction(async (data: ChangeInput) => {
    await repository.saveChange(avatarId, data, entry?.id);
    onClose();
  }, 'Change saved');
  return (
    <Modal
      drawer
      open
      onOpenChange={(v) => {
        if (
          !v &&
          !action.isPending &&
          (!form.formState.isDirty || window.confirm('Discard unsaved changes?'))
        )
          onClose();
      }}
      title={entry ? 'Edit change' : 'Add a change'}
      description="Describe your work. Leave it unreleased until it is ready to ship."
    >
      <form onSubmit={form.handleSubmit((v) => action.mutate(v))}>
        <label>
          Title
          <input autoFocus {...form.register('title')} placeholder="Added eye tracking support" />
        </label>
        <label>
          Description
          <textarea rows={4} {...form.register('description')} />
        </label>
        <label>Categories</label>
        <div className="category-options">
          {categories.map((c) => (
            <label key={c}>
              <input type="checkbox" value={c} {...form.register('categories')} />
              {c}
            </label>
          ))}
        </div>
        <div className="form-grid">
          <label>
            Importance
            <select {...form.register('importance')}>
              {['Minor', 'Normal', 'Major', 'Breaking'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Platform
            <select {...form.register('platform')}>
              {['All', 'PC', 'Quest', 'Other'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Date
            <input type="datetime-local" {...form.register('created_at')} />
          </label>
          <label>
            Release
            <select {...form.register('release_id', { setValueAs: (v) => v || null })}>
              <option value="">Unreleased</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.version}
                </option>
              ))}
            </select>
          </label>
        </div>
        {Object.entries(form.formState.errors).map(([k, e]) => (
          <p className="error-text" key={k}>
            {e.message}
          </p>
        ))}
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" disabled={action.isPending}>
            Save change
          </Button>
        </div>
      </form>
    </Modal>
  );
}
