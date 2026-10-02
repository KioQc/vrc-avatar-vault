import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { desktop, mockMode } from '../db/bridge';
import { Box, Copy } from 'lucide-react';
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { toast } from 'sonner';
import { Button } from './ui/button';
export function AvatarImage({
  src,
  name,
  className = '',
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const remote = !!src && src.startsWith('https://') && desktop && !mockMode;
  const image = useQuery({
    queryKey: ['image', src],
    queryFn: () => invoke<string>('avatar_image', { url: src }),
    enabled: remote,
    staleTime: 86400000,
    retry: 0,
  });
  const url = remote ? image.data : src;
  return url && failed !== url ? (
    <img
      className={`avatar-image ${className}`}
      src={url}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(url)}
    />
  ) : (
    <div className={`avatar-placeholder ${className}`}>
      <Box size={44} strokeWidth={1} />
      <span>{name.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}
export function Badge({
  children,
  tone = '',
  title,
}: {
  children: React.ReactNode;
  tone?: string;
  title?: string;
}) {
  const labels: Record<string, string> = {
    private: 'Private',
    public: 'Public',
    VeryPoor: 'Very Poor',
    None: 'Not rated',
  };
  const tones: Record<string, string> = {
    private: 'purple',
    public: 'green',
    PC: 'blue',
    Quest: 'green',
    iOS: 'purple',
    Good: 'green',
    Excellent: 'green',
    VeryPoor: 'danger',
    Poor: 'warning',
  };
  const key = typeof children === 'string' ? children : '';
  return (
    <span
      title={title ?? (key ? `API: ${key}` : undefined)}
      className={`badge ${tone || tones[key] || ''}`}
    >
      {labels[key] ?? children}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Box size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeleton-stack" aria-label="Loading" aria-busy="true">
      {[1, 2, 3].map((n) => (
        <div className="skeleton" key={n} />
      ))}
    </div>
  );
}
export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-notice" role="alert">
      <strong>Could not complete this action</strong>
      <p>{String(error instanceof Error ? error.message : error)}</p>
      {retry && <Button onClick={retry}>Retry</Button>}
    </div>
  );
}
export function timeAgo(date: string | null) {
  if (!date) return 'Never';
  const d = new Date(date);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : 'Unknown';
}
export function dateText(date: string | null) {
  if (!date) return 'Unknown';
  const d = new Date(date);
  return isValid(d)
    ? format(
        d,
        document.documentElement.dataset.dateFormat === 'iso'
          ? 'yyyy-MM-dd HH:mm'
          : 'MMM d, yyyy · HH:mm',
      )
    : 'Unknown';
}
export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  } catch {
    toast.error('Clipboard unavailable. Use export to save a file.');
  }
}
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <Button size="sm" onClick={() => void copy(text)}>
      <Copy size={14} />
      {label}
    </Button>
  );
}
