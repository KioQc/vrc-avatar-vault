import { Modal } from '../../components/ui/dialog';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import type { Attachment, Avatar, Change } from '../../types/domain';
import { repository } from '../../db/repository';
import { useAction } from '../../hooks/useVault';
import { storeImage, useAttachmentUrl } from '../../services/files';
import { AvatarImage, Badge, Empty } from '../../components/common';
import { Button } from '../../components/ui/button';
function GalleryImage({ a, avatar }: { a: Attachment; avatar: Avatar }) {
  const url = useAttachmentUrl(a.path);
  const [inspect, setInspect] = useState(false);
  const cover = useAction(
    () => repository.updateAvatar(avatar.id, { local_cover_path: a.path }),
    'Local cover set',
  );
  const remove = useAction(() => repository.deleteAttachment(a), 'Image detached');
  return (
    <article className="gallery-card">
      <button aria-label={`Inspect ${a.caption || a.type}`} onClick={() => setInspect(true)}>
        <AvatarImage src={url} name={a.caption || a.type} />
      </button>
      <div className="row between">
        <div>
          <Badge>{a.type}</Badge>
          <p>{a.caption}</p>
        </div>
        <div className="row">
          <Button
            size="icon"
            title="Set as local cover"
            aria-label="Set as local cover"
            onClick={() => cover.mutate()}
          >
            <Star size={14} />
          </Button>
          <Button
            size="icon"
            title="Detach image"
            aria-label="Detach image"
            onClick={() => {
              if (window.confirm('Detach this image from the avatar?')) remove.mutate();
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <Modal
        drawer
        open={inspect}
        onOpenChange={setInspect}
        title={a.caption || 'Attachment'}
        description={a.type}
      >
        <AvatarImage className="gallery-preview" src={url} name={a.caption || a.type} />
        <dl className="definition-grid">
          <dt>Added</dt>
          <dd>{new Date(a.created_at).toLocaleString()}</dd>
          <dt>File</dt>
          <dd>{a.path}</dd>
          <dt>Linked change</dt>
          <dd>{a.changelog_entry_id ?? 'Avatar gallery'}</dd>
        </dl>
        <Button onClick={() => cover.mutate()}>Set as local cover</Button>
      </Modal>
    </article>
  );
}
export function GalleryPanel({ avatar, changes }: { avatar: Avatar; changes: Change[] }) {
  const { data: images = [] } = useQuery({
    queryKey: ['attachments', avatar.id],
    queryFn: () => repository.attachments(avatar.id),
  });
  const [type, setType] = useState('Current'),
    [caption, setCaption] = useState(''),
    [entry, setEntry] = useState('');
  const clearCover = useAction(
    () => repository.updateAvatar(avatar.id, { local_cover_path: null }),
    'VRChat cover restored',
  );
  const upload = useAction(async (files: File[]) => {
    for (const f of files) {
      const path = await storeImage(f);
      await repository.addAttachment({
        avatar_id: avatar.id,
        changelog_entry_id: entry || null,
        path,
        type,
        caption,
      });
    }
  }, 'Images added');
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <h2>Gallery & attachments</h2>
          <Button disabled={!avatar.local_cover_path} onClick={() => clearCover.mutate()}>
            Use VRChat cover
          </Button>
        </div>
        <div className="form-grid">
          <label>
            Collection
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {['Current', 'Previous Versions', 'Reference', 'Unity', 'Before', 'After'].map(
                (t) => (
                  <option key={t}>{t}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Attach to changelog
            <select value={entry} onChange={(e) => setEntry(e.target.value)}>
              <option value="">Avatar gallery only</option>
              {changes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Caption
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Optional caption"
          />
        </label>
        <label
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!upload.isPending) upload.mutate(Array.from(e.dataTransfer.files));
          }}
        >
          <ImagePlus size={26} />
          <strong>{upload.isPending ? 'Saving images…' : 'Drop images here or browse'}</strong>
          <span className="tiny muted">PNG, JPG, WebP · up to 20 MB per image</span>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            disabled={upload.isPending}
            onChange={(e) => {
              if (e.target.files) upload.mutate(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </label>
      </section>
      {images.length ? (
        <div className="gallery-grid">
          {images.map((a) => (
            <div key={a.id}>
              <GalleryImage a={a} avatar={avatar} />
              {a.changelog_entry_id && (
                <p className="tiny muted">
                  Change:{' '}
                  {changes.find((c) => c.id === a.changelog_entry_id)?.title ?? 'Deleted change'}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="A picture of your progress"
          description="Keep references, Unity screenshots and before/after comparisons together."
        />
      )}
    </>
  );
}
