import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { WifiOff } from 'lucide-react';
import { AppSidebar, AppTopbar, StatusBar } from '../components/workspace';
import { toast } from 'sonner';
import { useAvatars, useSettings } from '../hooks/useVault';
import { useUI } from '../stores/ui';
import { vrchat } from '../api/VRChatApiClient';
import { repository } from '../db/repository';
import { query, desktop, mockMode } from '../db/bridge';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/dialog';
import { ImportDialog } from '../features/avatars/ImportDialog';
import { CommandPalette } from '../components/CommandPalette';
import { refreshAvatar, type DetectedUpdate } from '../services/sync';
import { DiffDialog } from '../features/snapshots/DiffDialog';
import { ChangeDialog } from '../features/changelogs/ChangeDialog';
import { syncIntervalMs, syncFreshnessMs, syncBackoffMs } from '../utils/syncPolicy';
export function AppLayout() {
  const { data: settings, isSuccess: settingsReady } = useSettings(),
    { data: avatars = [], isSuccess: avatarsReady } = useAvatars();
  const user = useUI((s) => s.user),
    setUser = useUI((s) => s.setUser),
    setImport = useUI((s) => s.setImport),
    setPalette = useUI((s) => s.setPalette);
  const [online, setOnline] = useState(navigator.onLine),
    [updates, setUpdates] = useState<DetectedUpdate[]>([]),
    [saving, setSaving] = useState<DetectedUpdate | null>(null);
  const client = useQueryClient(),
    navigate = useNavigate();
  useEffect(() => {
    if (!desktop || mockMode) return;
    const promise = listen<{ avatarId: string }>('bridge-open', (event) =>
      navigate(`/avatars/${event.payload.avatarId}?tab=Development`),
    );
    return () => {
      void promise.then((stop) => stop());
    };
  }, [navigate]);
  useEffect(() => {
    if (!desktop || mockMode) return;
    const listener = listen('bridge-changed', () => {
      void client.invalidateQueries();
    });
    return () => {
      void listener.then((stop) => stop());
    };
  }, [client]);
  const interrupted = useQuery({
    queryKey: ['interrupted-work'],
    queryFn: () =>
      query<{ avatar_id: string; name: string }>(
        "SELECT w.avatar_id,a.name FROM work_sessions w JOIN avatars a ON a.id=w.avatar_id WHERE w.status='Interrupted'",
      ),
    refetchInterval: 15000,
  });
  const syncBusy = useRef(false);
  const syncRetry = useRef({ after: 0, failures: 0 });
  const avatarsRef = useRef(avatars);
  avatarsRef.current = avatars;
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('vault-quick-action', { detail: { action: 0 } }));
      }
      if (
        e.key === '/' &&
        !(
          e.target instanceof HTMLElement &&
          (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)
        )
      ) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('main input[placeholder*="earch"]')?.focus();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'i' || (e.shiftKey && e.key.toLowerCase() === 'n'))
      ) {
        e.preventDefault();
        setImport(true);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [setImport, setPalette]);
  useEffect(() => {
    if (!desktop && !mockMode) return;
    void vrchat
      .verifySession()
      .then((u) => {
        if (u.id) setUser(u);
      })
      .catch(() => {
        /* A missing/expired session does not block offline workspace access. */
      });
  }, [setUser]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--accent',
      /^#[0-9a-f]{6}$/i.test(settings?.accent ?? '') ? settings!.accent : '#a78bfa',
    );
    document.documentElement.dataset.theme = settings?.theme ?? 'dark';
    document.documentElement.dataset.density = settings?.density ?? 'compact';
    document.documentElement.dataset.sidebar = settings?.sidebar ?? 'expanded';
    document.documentElement.dataset.motion = settings?.reduceMotion ?? 'false';
    document.documentElement.dataset.dateFormat = settings?.dateFormat ?? 'friendly';
    vrchat.ttl = Number(settings?.ttl ?? 15) * 60000;
  }, [settings]);
  useEffect(() => {
    const handler = (e: Event) =>
      setUpdates((prev) => [...prev, (e as CustomEvent<DetectedUpdate>).detail]);
    window.addEventListener('vault-detected', handler);
    return () => window.removeEventListener('vault-detected', handler);
  }, []);
  useEffect(() => {
    if (!desktop) return;
    const sub = listen<{ seconds: number; status: number }>('api-retry', (e) =>
      toast.info(
        e.payload.status === 429
          ? `VRChat is rate limiting requests. Retrying in ${e.payload.seconds}s…`
          : `VRChat is unavailable. Retrying in ${e.payload.seconds}s…`,
        { id: 'api-retry' },
      ),
    );
    return () => {
      void sub.then((unlisten) => unlisten());
    };
  }, []);
  useEffect(() => {
    if (!user?.id || !settingsReady || !avatarsReady || settings?.sync === 'off') return;
    let cancelled = false;

    async function run() {
      if (
        cancelled ||
        syncBusy.current ||
        !navigator.onLine ||
        Date.now() < syncRetry.current.after
      )
        return;
      syncBusy.current = true;
      try {
        for (const a of avatarsRef.current) {
          if (cancelled) break;
          if (
            a.archived ||
            !a.vrchat_id ||
            Date.now() - new Date(a.last_api_refresh_at ?? 0).getTime() <
              syncFreshnessMs(settings?.sync, settings?.ttl)
          )
            continue;
          try {
            const update = await refreshAvatar(
              a,
              () => !cancelled && useUI.getState().user?.id === user?.id,
            );
            if (cancelled) break;
            syncRetry.current = { after: 0, failures: 0 };
            if (update.differences.length) setUpdates((prev) => [...prev, update]);
            await client.invalidateQueries({
              predicate: (q) =>
                ['avatars', 'snapshots', 'activity'].includes(String(q.queryKey[0])),
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (e) {
            if (cancelled) break;
            syncRetry.current.failures++;
            syncRetry.current.after = Date.now() + syncBackoffMs(syncRetry.current.failures);
            toast.error(`Automatic refresh paused: ${String(e)}`, { id: 'sync-error' });
            break;
          }
        }
      } finally {
        syncBusy.current = false;
      }
    }
    void run();
    const interval = syncIntervalMs(settings?.sync);
    const timer = interval ? setInterval(() => void run(), interval) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [user?.id, settingsReady, avatarsReady, settings?.sync, settings?.ttl, client]);
  async function welcome(connect: boolean) {
    try {
      await repository.setting('onboarded', 'true');
      await client.invalidateQueries({ queryKey: ['settings'] });
      if (connect) navigate('/settings');
    } catch (e) {
      toast.error(String(e));
    }
  }
  const update = updates[0];
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="main-shell">
        <AppTopbar />
        {!online && (
          <div className="offline-banner">
            <WifiOff size={14} />
            Offline · Using cached VRChat data. Local editing remains available.
          </div>
        )}
        {mockMode && (
          <div className="mock-banner">
            DEVELOPMENT FIXTURES · Isolated browser SQLite · No VRChat API calls
          </div>
        )}
        <main>
          {!!interrupted.data?.length && (
            <div className="offline-banner">
              Interrupted work sessions:{' '}
              {interrupted.data.map((session, index) => (
                <Button
                  key={index}
                  onClick={() => navigate(`/avatars/${session.avatar_id}?tab=Development`)}
                >
                  {session.name} — review Work & stats
                </Button>
              ))}
            </div>
          )}
          <Outlet />
        </main>
        <StatusBar />
      </div>
      <ImportDialog />
      <CommandPalette />
      <Modal
        open={settingsReady && settings?.onboarded !== 'true'}
        onOpenChange={(v) => {
          if (!v) void welcome(false);
        }}
        title="Welcome to VRC Avatar Vault"
        description="Keep track of your VRChat avatars, versions and changes."
      >
        <div className="welcome-steps">
          <p>
            <span>01</span> Connect your VRChat account
          </p>
          <p>
            <span>02</span> Import your first avatar
          </p>
          <p>
            <span>03</span> Start tracking changes
          </p>
        </div>
        <div className="dialog-actions">
          <Button onClick={() => void welcome(false)}>Skip for now</Button>
          <Button variant="default" onClick={() => void welcome(true)}>
            Connect VRChat
          </Button>
        </div>
      </Modal>
      {update && (
        <DiffDialog
          title={`${update.avatar.name} · VRChat update detected`}
          differences={update.differences}
          onClose={() => setUpdates((prev) => prev.slice(1))}
          onSave={() => {
            setSaving(update);
            setUpdates((prev) => prev.slice(1));
          }}
        />
      )}
      {saving && (
        <ChangeDialog
          avatarId={saving.avatar.id}
          initial={{
            title: 'VRChat metadata updated',
            description: saving.differences
              .map(
                (d) =>
                  `${d.field}: ${JSON.stringify(d.oldValue)} Ã¢â€ ’ ${JSON.stringify(d.newValue)}`,
              )
              .join('\n'),
          }}
          onClose={() => setSaving(null)}
        />
      )}
    </div>
  );
}
