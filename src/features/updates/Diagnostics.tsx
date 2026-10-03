import { useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { desktop, mockMode } from '../../db/bridge';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { ErrorNotice } from '../../components/common';

export function StartupGate({ children }: { children: ReactNode }) {
  const native = desktop && !mockMode;
  const status = useQuery({
    queryKey: ['startup'],
    queryFn: () => invoke<{ error: string | null }>('startup_status'),
    enabled: native,
    retry: false,
    staleTime: Infinity,
  });
  const folder = useMutation({ mutationFn: (kind: string) => invoke('recovery_folder', { kind }) });
  if (!native) return children;
  if (status.isPending) return <p role="status">Opening your local vault…</p>;
  const error = status.error || status.data?.error;
  if (!error) return children;
  return (
    <div className="fatal">
      <h1>Your vault could not be opened</h1>
      <ErrorNotice error={error} />
      <p>
        Your original database has not been deleted or recreated. Keep it and its WAL/SHM files
        together. Check disk space and folder permissions, or contact support with the logs before
        attempting recovery.
      </p>
      <Button onClick={() => location.reload()}>Retry opening</Button>
      {['data', 'backups', 'logs'].map((kind) => (
        <Button key={kind} onClick={() => folder.mutate(kind)}>
          Open {kind} folder
        </Button>
      ))}
      {folder.error && <ErrorNotice error={folder.error} />}
    </div>
  );
}

export function Diagnostics() {
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState('');
  const [feedback, setFeedback] = useState('');
  const action = useMutation({
    mutationFn: async (operation: string) => {
      setFeedback('');
      if (['data', 'backups', 'logs'].includes(operation)) {
        await invoke('recovery_folder', { kind: operation });
        return;
      }
      if (operation === 'export') {
        const path = await save({
          defaultPath: `vav-support-${new Date().toISOString().slice(0, 10)}.zip`,
          filters: [{ name: 'Support bundle', extensions: ['zip'] }],
        });
        if (!path) return;
        await invoke('diagnostics', { operation: 'export', path });
        setFeedback('Support bundle exported. Nothing was uploaded.');
        setConfirm(false);
        return;
      }
      const result = await invoke<{ text: string }>('diagnostics', { operation: 'report' });
      setReport(result.text);
      if (operation === 'copy') {
        await navigator.clipboard.writeText(result.text);
        setFeedback('Diagnostics copied.');
      }
    },
  });
  return (
    <section className="panel" id="settings-diagnostics">
      <h2>Advanced · Diagnostics</h2>
      <p>
        Run database integrity and reference checks on demand. The report contains operational
        information, without your avatars or authentication data.
      </p>
      <div className="row">
        {[
          ['report', 'Check database & diagnostics'],
          ['copy', 'Copy diagnostics'],
          ['data', 'Open data folder'],
          ['backups', 'Open backup folder'],
          ['logs', 'Open logs folder'],
        ].map(([op, label]) => (
          <Button
            key={op}
            disabled={!desktop || mockMode || action.isPending}
            onClick={() => action.mutate(op)}
          >
            {label}
          </Button>
        ))}
        <Button
          disabled={!desktop || mockMode || action.isPending}
          onClick={() => setConfirm(true)}
        >
          Export support bundle
        </Button>
      </div>
      {action.isPending && <p role="status">Checking / exporting…</p>}
      {feedback && <p role="status">{feedback}</p>}
      {action.error && <ErrorNotice error={action.error} />}
      {report && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report}</pre>}
      <Modal
        open={confirm}
        onOpenChange={(v) => {
          if (!action.isPending) setConfirm(v);
        }}
        title="Export support bundle"
        description="Contains diagnostic information and application logs. Sensitive log entries are redacted and Windows profile paths are masked. No database, avatars, images or authentication data are included."
      >
        <p>The ZIP stays on your PC. You choose whether to share it.</p>
        <Button disabled={action.isPending} onClick={() => action.mutate('export')}>
          Choose destination & export
        </Button>
        {action.error && <ErrorNotice error={action.error} />}
      </Modal>
    </section>
  );
}
