import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';
export function ContextMenu({
  children,
  actions,
}: {
  children: ReactNode;
  actions: { label: string; run: () => void; disabled?: boolean }[];
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setPoint({
          x: Math.min(e.clientX, window.innerWidth - 215),
          y: Math.min(e.clientY, window.innerHeight - actions.length * 34 - 20),
        });
      }}
      onKeyDown={(e) => {
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          setPoint({
            x: Math.min(rect.left + 20, window.innerWidth - 215),
            y: Math.min(rect.top + 30, window.innerHeight - actions.length * 34 - 20),
          });
        }
      }}
    >
      {children}
      <Dialog.Root
        open={!!point}
        onOpenChange={(v) => {
          if (!v) setPoint(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="context-overlay" />
          <Dialog.Content
            className="context-menu"
            style={{ left: point?.x, top: point?.y }}
            aria-describedby={undefined}
            onKeyDown={(e) => {
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
                );
                const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
                buttons[
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? buttons.length - 1
                      : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                ]?.focus();
              }
            }}
          >
            <Dialog.Title className="sr-only">Context actions</Dialog.Title>
            <div role="menu">
              {actions.map((a) => (
                <button
                  role="menuitem"
                  key={a.label}
                  disabled={a.disabled}
                  onClick={() => {
                    setPoint(null);
                    a.run();
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
