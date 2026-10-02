import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Clipboard, Download, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { AvatarImage, Badge, dateText, ErrorNotice } from '../../components/common';
import { useUI } from '../../stores/ui';
import { useAvatars } from '../../hooks/useVault';
import { vrchat } from '../../api/VRChatApiClient';
import { repository } from '../../db/repository';
import { validateAvatarId, platforms } from '../../utils/domain';
import type { ApiAvatar } from '../../types/domain';
import { mockMode } from '../../db/bridge';
export function ImportDialog() {
  const open = useUI((s) => s.importOpen),
    setOpen = useUI((s) => s.setImport);
  const [text, setText] = useState(''),
    [preview, setPreview] = useState<ApiAvatar[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState<unknown>(null);
  const { data: avatars = [] } = useAvatars();
  const client = useQueryClient(),
    navigate = useNavigate();
  async function fetchAvatars() {
    setBusy(true);
    setError(null);
    setPreview([]);
    try {
      const ids = [
        ...new Set(
          text
            .split(/[\s,;]+/)
            .filter(Boolean)
            .map((s) => s.toLowerCase()),
        ),
      ];
      if (!ids.length || ids.some((id) => !validateAvatarId(id)))
        throw new Error('Enter valid avtr_ UUIDs, one per line.');
      const data: ApiAvatar[] = [];
      for (const [index, id] of ids.entries()) {
        setProgress(`Fetching avatar ${index + 1} / ${ids.length} from VRChat…`);
        data.push(await vrchat.getAvatar(id));
        setPreview([...data]);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError(null);
    try {
      let last: string | undefined;
      for (const avatar of preview) {
        if (avatars.some((a) => a.vrchat_id === avatar.id.toLowerCase())) continue;
        last = await repository.saveAvatar(avatar);
      }
      await client.invalidateQueries();
      toast.success('Avatars imported');
      setOpen(false);
      setPreview([]);
      setText('');
      if (last) navigate(`/avatars/${last}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!busy) setOpen(v);
      }}
      title="Import from VRChat"
      description="Add an avatar to your vault. Your VRChat avatar is never modified."
      wide
    >
      <label>
        VRChat Avatar ID
        <textarea
          rows={3}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview([]);
          }}
          placeholder="avtr_8c63ff8d-da1e-415a-912b-585ab866938f"
          disabled={busy}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (busy || !file) return;
            if (!file.name.toLowerCase().endsWith('.txt') || file.size > 1024 * 1024) {
              toast.error('Use a .txt file smaller than 1 MB');
              return;
            }
            void file
              .text()
              .then((content) => {
                const ids = content.match(/avtr_[0-9a-f-]{36}/gi)?.filter(validateAvatarId);
                if (ids?.length) {
                  setText([...new Set(ids)].join('\n'));
                  setPreview([]);
                } else toast.info('No valid avatar IDs found');
              })
              .catch(() => toast.error('Could not read text file'));
          }}
        />
      </label>
      <div className="row between">
        <span className="muted tiny">One ID per line for bulk import</span>
        <Button
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .readText()
              .then((t) => {
                const ids = t.match(/avtr_[0-9a-f-]{36}/gi)?.filter(validateAvatarId);
                if (ids?.length) setText([...new Set(ids)].join('\n'));
                else toast.info('No avatar ID found in clipboard');
              })
              .catch(() => toast.error('Clipboard permission is unavailable'))
          }
        >
          <Clipboard size={14} />
          Paste IDs
        </Button>
      </div>
      {mockMode && (
        <p className="notice">Development fixture: avtr_8c63ff8d-da1e-415a-912b-585ab866938f</p>
      )}
      {busy && <p role="status">{progress || 'Saving to SQLite…'}</p>}
      {error != null && <ErrorNotice error={error} />}
      <div className="import-previews">
        {preview.map((a) => {
          const exists = avatars.find((v) => v.vrchat_id === a.id.toLowerCase());
          return (
            <div className="import-preview" key={a.id}>
              <AvatarImage src={a.thumbnailImageUrl} name={a.name} />
              <div>
                <h3>{a.name}</h3>
                <p className="muted">by {a.authorName}</p>
                <div className="row">
                  {platforms(a).map((p) => (
                    <Badge key={p}>{p}</Badge>
                  ))}
                  <Badge>{a.releaseStatus}</Badge>
                </div>
                <p className="tiny muted">
                  VRChat {a.version} · {dateText(a.updated_at)}
                </p>
                {exists && (
                  <div>
                    <p>Avatar already exists.</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/avatars/${exists.id}`);
                      }}
                    >
                      Open Avatar
                    </Button>{' '}
                    <Button
                      disabled={busy}
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/avatars/${exists.id}?refresh=1`);
                      }}
                    >
                      Refresh Metadata
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="dialog-actions">
        <Button onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        {preview.length === 0 ? (
          <Button
            variant="default"
            onClick={() => void fetchAvatars()}
            disabled={busy || !text.trim()}
          >
            <Download size={16} />
            Fetch preview
          </Button>
        ) : (
          <Button
            variant="default"
            onClick={() => void commit()}
            disabled={
              busy ||
              !!error ||
              preview.every((p) => avatars.some((a) => a.vrchat_id === p.id.toLowerCase()))
            }
          >
            <Plus size={16} />
            Import{' '}
            {
              preview.filter((p) => !avatars.some((a) => a.vrchat_id === p.id.toLowerCase())).length
            }{' '}
            avatars
          </Button>
        )}
      </div>
    </Modal>
  );
}
