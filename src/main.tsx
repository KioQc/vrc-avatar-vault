import React from 'react';
import { StartupGate } from './features/updates/Diagnostics';
import { invoke } from '@tauri-apps/api/core';
import { desktop, mockMode } from './db/bridge';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { AppLayout } from './layouts/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Avatars } from './pages/Avatars';
import { Changelogs, Activity, Tags } from './pages/Collections';
import { Loading } from './components/common';
const AvatarDetail = React.lazy(() =>
  import('./pages/AvatarDetail').then((m) => ({ default: m.AvatarDetail })),
);
const Settings = React.lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings })),
);
const VRChatCenter = React.lazy(() =>
  import('./pages/VRChatCenter').then((m) => ({ default: m.VRChatCenter })),
);
import './styles.css';
import './desktop.css';
import { WorkspaceTools } from './pages/WorkspaceTools';
const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 0, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch() {
    if (desktop && !mockMode)
      void invoke('diagnostics', { operation: 'ui_error' }).catch(() => undefined);
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>The vault could not display this page.</h1>
        <p>VAV encountered an unexpected interface error.</p>
        <button onClick={() => location.reload()}>Reload application</button>
        <p>Your local database has not been reset.</p>
        {desktop && (
          <button
            onClick={() => {
              void invoke('recovery_folder', { kind: 'logs' }).catch(() =>
                window.alert('Cannot open logs folder. Check folder permissions.'),
              );
            }}
          >
            Open logs
          </button>
        )}
      </div>
    ) : (
      this.props.children
    );
  }
}
if (desktop && !mockMode) {
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    toast.error(
      'An operation failed unexpectedly. Your vault has not been reset. Check Diagnostics or reload the interface.',
    );
    void invoke('diagnostics', { operation: 'ui_error' }).catch(() => undefined);
  });
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={client}>
      <StartupGate>
        <HashRouter>
          <React.Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="avatars" element={<Avatars />} />
                <Route path="avatars/:id" element={<AvatarDetail />} />
                <Route path="changelogs" element={<Changelogs />} />
                <Route path="activity" element={<Activity />} />
                <Route path="tags" element={<Tags />} />
                <Route path="vrchat" element={<VRChatCenter />} />
                <Route path="workspace/:tool" element={<WorkspaceTools />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Dashboard />} />
              </Route>
            </Routes>
          </React.Suspense>
        </HashRouter>
      </StartupGate>
      <Toaster theme="dark" richColors position="bottom-right" closeButton />
    </QueryClientProvider>
  </ErrorBoundary>,
);
