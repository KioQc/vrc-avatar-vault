import { invoke } from '@tauri-apps/api/core';
import { Modal } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { ErrorNotice } from '../../components/common';
import { useAction } from '../../hooks/useVault';
import { query, desktop, mockMode } from '../../db/bridge';
import { studio } from '../../services/studio';
import type { ScanData } from '../../types/studio';
export function ReleaseBaselineOffer({
  avatarId,
  version,
  onClose,
}: {
  avatarId: string;
  version: string;
  onClose: () => void;
}) {
  const action = useAction(async () => {
    const [release] = await query<{ id: string }>(
      'SELECT id FROM releases WHERE avatar_id=? AND version=?',
      avatarId,
      version,
    );
    if (!release) throw new Error('Release not found');
    const scan = await invoke<ScanData>('scan_project', { avatarId });
    await studio.action('snapshot', {
      avatarId,
      kind: 'filesystem',
      label: `Release v${version} baseline`,
      releaseId: release.id,
      baseline: true,
      data: scan,
    });
    onClose();
  }, 'Release baseline saved');
  return (
    <Modal
      open
      title={`Release v${version} saved`}
      description="Start the next work cycle from a known project state."
      onOpenChange={(open) => {
        if (!open && !action.isPending) onClose();
      }}
    >
      <p>
        Create a filesystem snapshot of the project as it is now, link it to this release and use it
        as the new baseline. This is optional and does not modify your Unity assets.
      </p>
      {action.error && <ErrorNotice error={action.error} />}
      <div className="dialog-actions">
        <Button disabled={action.isPending} onClick={onClose}>
          Not now
        </Button>
        <Button
          variant="default"
          disabled={!desktop || mockMode || action.isPending}
          onClick={() => action.mutate()}
        >
          Create linked baseline
        </Button>
      </div>
    </Modal>
  );
}
