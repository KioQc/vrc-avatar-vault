import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Avatar, Todo } from '../../types/domain';
import { repository } from '../../db/repository';
import { useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
export function NotesPanel({
  avatar,
  onConvert,
}: {
  avatar: Avatar;
  onConvert: (t: Todo) => void;
}) {
  const [notes, setNotes] = useState(avatar.notes),
    [status, setStatus] = useState('Saved'),
    [preview, setPreview] = useState(false),
    [title, setTitle] = useState(''),
    [priority, setPriority] = useState('Normal');
  const saved = useRef(avatar.notes);
  const pending = useRef(notes);
  pending.current = notes;
  useEffect(() => {
    if (notes === saved.current) return;
    setStatus('Unsaved');
    const timer = setTimeout(() => {
      setStatus('Saving…');
      void repository
        .updateAvatar(avatar.id, { notes })
        .then(() => {
          saved.current = notes;
          setStatus('Saved');
        })
        .catch(() => {
          setStatus('Save failed — retry by editing');
          toast.error('Notes could not be saved. Your text remains in the editor.');
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [notes, avatar.id]);
  useEffect(
    () => () => {
      if (pending.current !== saved.current)
        void repository
          .updateAvatar(avatar.id, { notes: pending.current })
          .catch(() => toast.error('Could not save notes before leaving this page'));
    },
    [avatar.id],
  );
  const { data: todos = [] } = useQuery({
    queryKey: ['todos', avatar.id],
    queryFn: () => repository.todos(avatar.id),
  });
  const add = useAction(async () => {
    await repository.addTodo(avatar.id, title, priority);
    setTitle('');
  });
  const toggle = useAction((t: Todo) => repository.toggleTodo(t));
  const remove = useAction((id: string) => repository.deleteTodo(id));
  return (
    <div className="detail-columns">
      <section className="panel">
        <div className="section-heading">
          <h2>Personal notes</h2>
          <div className="row">
            <span className="tiny muted" role="status">
              {status}
            </span>
            <Button size="sm" onClick={() => setPreview(!preview)}>
              {preview ? 'Edit' : 'Preview'}
            </Button>
          </div>
        </div>
        {preview ? (
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes || '*No notes yet.*'}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            className="notes-editor"
            aria-label="Personal Markdown notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={'# Next iteration\n\n- [ ] Fix Quest hair\n- [ ] Test face tracking'}
          />
        )}
      </section>
      <section className="panel">
        <h2>
          Tasks <span className="heading-count">{todos.filter((t) => !t.completed).length}</span>
        </h2>
        <form
          className="task-form"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <input
            aria-label="New task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What’s next?"
          />
          <div className="row">
            <select
              value={priority}
              aria-label="Task priority"
              onChange={(e) => setPriority(e.target.value)}
            >
              {['Low', 'Normal', 'High'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <Button disabled={!title.trim() || add.isPending}>
              <Plus size={15} />
              Add task
            </Button>
          </div>
        </form>
        {todos.map((t) => (
          <div className="todo-row" key={t.id}>
            <input
              type="checkbox"
              checked={!!t.completed}
              aria-label={`Complete ${t.title}`}
              onChange={() => toggle.mutate(t)}
            />
            <div className="grow">
              <span className={t.completed ? 'completed' : ''}>{t.title}</span>
              <p className="tiny muted">{t.priority} priority</p>
              {!!t.completed && (
                <Button size="sm" variant="ghost" onClick={() => onConvert(t)}>
                  Add to changelog
                </Button>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete task"
              onClick={() => remove.mutate(t.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </section>
    </div>
  );
}
