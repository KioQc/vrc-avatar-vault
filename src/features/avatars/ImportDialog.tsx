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
import { importAvatars, type ImportReport } from '../../services/importAvatars';
import { filterImport } from '../../utils/library';
import { useLocale } from '../../hooks/useLocale';
import { validateAvatarId, platforms } from '../../utils/domain';
import type { ApiAvatar } from '../../types/domain';
import { mockMode } from '../../db/bridge';
export function ImportDialog() {
  const { t } = useLocale();
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [presenceFilter, setPresenceFilter] = useState('all');
  const [sort, setSort] = useState('updated');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const open = useUI((s) => s.importOpen),
    setOpen = useUI((s) => s.setImport);
  const user = useUI((s) => s.user);
  const [source, setSource] = useState<'account' | 'ids'>('account');
  const [selected, setSelected] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [text, setText] = useState(''),
    [preview, setPreview] = useState<ApiAvatar[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState<unknown>(null);
  const { data: avatars = [] } = useAvatars();
  const client = useQueryClient(),
    navigate = useNavigate();
  const filtered = filterImport(
    preview,
    avatars.flatMap((a) => (a.vrchat_id ? [a.vrchat_id] : [])),
    {
      search,
      status: statusFilter,
      platform: platformFilter,
      presence: presenceFilter,
      sort,
    },
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(pageNumber, pageCount);
  const shown = filtered.slice((currentPage - 1) * 8, currentPage * 8);
  async function fetchAccount() {
    setBusy(true);
    setError(null);
    setProgress('Loading your uploaded avatars…');
    setReport(null);
    try {
      const accountAvatars = await vrchat.getAllOwnAvatars((count) =>
        setProgress(`Loading your avatars… ${count} found`),
      );
      setPreview(accountAvatars);
      setPageNumber(1);
      setLoaded(true);
      setSelected([]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  async function fetchAvatars() {
    setReport(null);
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
        setSelected(data.map((a) => a.id));
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function commit(retryIds?: string[]) {
    setBusy(true);
    setError(null);
    try {
      const result = await importAvatars(retryIds ?? selected, updateExisting, (current, total) =>
        setProgress(`${t('Import selected')} · ${current} / ${total}`),
      );
      setReport(result);
      await client.invalidateQueries();
      setSelected(result.failures.map((failure) => failure.id));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!busy) setOpen(v);
      }}
      title={t('Import from VRChat')}
      description={t('Add an avatar to your vault. Your VRChat avatar is never modified.')}
      wide
    >
      <div className="tabs" role="tablist" aria-label="Import source">
        {(['account', 'ids'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={source === value}
            className={source === value ? 'active' : ''}
            disabled={busy}
            onClick={() => {
              setSource(value);
              setPreview([]);
              setSelected([]);
              setLoaded(false);
              setPageNumber(1);
              setSearch('');
              setError(null);
              setReport(null);
            }}
          >
            {t(value === 'account' ? 'My VRChat avatars' : 'Import by ID')}
          </button>
        ))}
      </div>
      {source === 'account' ? (
        <>
          <p className="muted">
            {t(
              'Choose avatars uploaded by your connected account. Importing adds them to your local vault.',
            )}
          </p>
          {!user && <p className="notice">{t('Connect your VRChat account in Settings first.')}</p>}
          <Button disabled={busy || !user} onClick={() => void fetchAccount()}>
            {t(loaded ? 'Refresh account avatars' : 'Load account avatars')}
          </Button>
          {loaded && !preview.length && (
            <p className="notice">{t('No uploaded avatars found on this account.')}</p>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
      {preview.length > 0 && (
        <div className="row wrap">
          {(
            [
              [
                statusFilter,
                setStatusFilter,
                [
                  ['all', 'All'],
                  ['public', 'Public'],
                  ['private', 'Private'],
                ],
                'Status',
              ],
              [
                platformFilter,
                setPlatformFilter,
                [
                  ['all', 'All'],
                  ['PC', 'PC'],
                  ['Quest', 'Quest'],
                  ['iOS', 'iOS'],
                ],
                'Platform',
              ],
              [
                presenceFilter,
                setPresenceFilter,
                [
                  ['all', 'All'],
                  ['new', 'New'],
                  ['existing', 'Already imported'],
                ],
                'Presence',
              ],
              [
                sort,
                setSort,
                [
                  ['updated', 'Last modified'],
                  ['name', 'Name'],
                  ['created', 'Created'],
                ],
                'Sort',
              ],
            ] as const
          ).map(([value, setter, options, label]) => (
            <select
              key={label}
              aria-label={label}
              value={value}
              disabled={busy}
              onChange={(e) => {
                setter(e.target.value);
                setPageNumber(1);
              }}
            >
              {options.map(([key, title]) => (
                <option key={key} value={key}>
                  {t(title)}
                </option>
              ))}
            </select>
          ))}
          <input
            aria-label="Search avatars to import"
            placeholder={t('Search avatars…')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPageNumber(1);
            }}
          />
          <Button
            disabled={busy}
            onClick={() =>
              setSelected([
                ...new Set([
                  ...selected,
                  ...shown
                    .filter(
                      (p) =>
                        (updateExisting ||
                          !avatars.some((a) => a.vrchat_id === p.id.toLowerCase())) &&
                        p.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((p) => p.id),
                ]),
              ])
            }
          >
            {t('Select shown')}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              setSelected([
                ...new Set([
                  ...selected,
                  ...filtered
                    .filter(
                      (p) =>
                        updateExisting || !avatars.some((a) => a.vrchat_id === p.id.toLowerCase()),
                    )
                    .map((p) => p.id),
                ]),
              ])
            }
          >
            {t('Select all results')}
          </Button>
          <Button disabled={busy} onClick={() => setSelected([])}>
            {t('Clear selection')}
          </Button>
        </div>
      )}
      {busy && <p role="status">{progress || 'Saving to SQLite…'}</p>}
      {error != null && <ErrorNotice error={error} />}
      {preview.length > 0 && (
        <label className="row wrap">
          <input
            type="checkbox"
            checked={updateExisting}
            disabled={busy}
            onChange={(e) => setUpdateExisting(e.target.checked)}
          />
          {t('Update existing avatars')}
          <span className="tiny muted">{t('Notes and local history are preserved.')}</span>
        </label>
      )}
      {report && (
        <section className="notice" role="status">
          <h3>{t('Import summary')}</h3>
          <p>
            {report.imported} {t('New')} · {report.refreshed} {t('Refresh')} · {report.skipped}{' '}
            {t('Already imported')} · {report.failures.length} {t('Failures')}
          </p>
          {report.failures.map((failure) => (
            <p className="tiny break-all" key={failure.id}>
              {failure.id} · {failure.message}
            </p>
          ))}
          {!!report.failures.length && (
            <Button disabled={busy} onClick={() => void commit(report.failures.map((f) => f.id))}>
              {t('Retry failures')}
            </Button>
          )}
        </section>
      )}
      {loaded && preview.length > 0 && !filtered.length && (
        <p className="notice">{t('No avatars match these filters.')}</p>
      )}
      <div className="import-previews compact-import">
        {shown.map((a) => {
          const exists = avatars.find((v) => v.vrchat_id === a.id.toLowerCase());
          return (
            <div className="import-preview" key={a.id}>
              <input
                type="checkbox"
                aria-label={`Import ${a.name}`}
                disabled={busy || (!!exists && !updateExisting)}
                checked={(!exists || updateExisting) && selected.includes(a.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
                  )
                }
              />
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
                    <p>{t('Avatar already exists.')}</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/avatars/${exists.id}`);
                      }}
                    >
                      {t('Open Avatar')}
                    </Button>{' '}
                    <Button
                      disabled={busy}
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/avatars/${exists.id}?refresh=1`);
                      }}
                    >
                      {t('Refresh Metadata')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {preview.length > 0 && (
        <nav className="import-pagination row wrap" aria-label="Avatar import pages">
          <span className="muted tiny">
            {filtered.length} avatars · Page {currentPage} / {pageCount}
          </span>
          <Button
            size="sm"
            disabled={busy || currentPage === 1}
            onClick={() => setPageNumber(currentPage - 1)}
          >
            {t('Previous')}
          </Button>
          {Array.from({ length: pageCount }, (_, index) => index + 1)
            .filter((page) => page === 1 || page === pageCount || Math.abs(page - currentPage) <= 2)
            .map((page) => (
              <Button
                key={page}
                size="sm"
                disabled={busy}
                aria-current={page === currentPage ? 'page' : undefined}
                variant={page === currentPage ? 'default' : 'secondary'}
                onClick={() => setPageNumber(page)}
              >
                {page}
              </Button>
            ))}
          <Button
            size="sm"
            disabled={busy || currentPage === pageCount}
            onClick={() => setPageNumber(currentPage + 1)}
          >
            {t('Next')}
          </Button>
        </nav>
      )}
      <div className="dialog-actions">
        <Button onClick={() => setOpen(false)} disabled={busy}>
          {t(report ? 'Close' : 'Cancel')}
        </Button>
        {preview.length === 0 && source === 'ids' ? (
          <Button
            variant="default"
            onClick={() => void fetchAvatars()}
            disabled={busy || !text.trim()}
          >
            <Download size={16} />
            {t('Fetch preview')}
          </Button>
        ) : (
          <Button
            variant="default"
            onClick={() => void commit()}
            disabled={
              busy ||
              !!error ||
              !preview.some(
                (p) =>
                  selected.includes(p.id) &&
                  (updateExisting || !avatars.some((a) => a.vrchat_id === p.id.toLowerCase())),
              )
            }
          >
            <Plus size={16} />
            {t('Import selected')}{' '}
            {
              preview.filter(
                (p) =>
                  selected.includes(p.id) &&
                  (updateExisting || !avatars.some((a) => a.vrchat_id === p.id.toLowerCase())),
              ).length
            }{' '}
            avatars
          </Button>
        )}
      </div>
    </Modal>
  );
}
