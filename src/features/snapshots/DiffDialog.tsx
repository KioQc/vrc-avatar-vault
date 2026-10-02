import type { Difference } from '../../types/domain';
import { Modal } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
export function DiffDialog({
  differences,
  title,
  onClose,
  onSave,
}: {
  differences: Difference[];
  title: string;
  onClose: () => void;
  onSave?: () => void;
}) {
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={title}
      description="Snapshot comparison. A changelog is created only when you choose to save it."
      wide
    >
      {differences.length ? (
        <div className="diff-list">
          {differences.map((d) => (
            <div key={d.field}>
              <strong>{d.field}</strong>
              <div className="diff-values">
                <pre className="removed">− {JSON.stringify(d.oldValue, null, 2) ?? '—'}</pre>
                <pre className="added">+ {JSON.stringify(d.newValue, null, 2) ?? '—'}</pre>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="notice">No significant changes. A new snapshot was saved.</p>
      )}
      <div className="dialog-actions">
        <Button onClick={onClose}>Dismiss</Button>
        {onSave && differences.length > 0 && (
          <Button variant="default" onClick={onSave}>
            Save as changelog
          </Button>
        )}
      </div>
    </Modal>
  );
}
