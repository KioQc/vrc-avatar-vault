export function syncIntervalMs(mode: string | undefined): number | null {
  if (mode === '30s') return 30_000;
  const hours = Number(mode);
  return Number.isFinite(hours) && hours > 0 ? hours * 3_600_000 : null;
}
export function syncFreshnessMs(mode: string | undefined, ttl: string | undefined) {
  return mode === '30s' ? 30_000 : Math.max(1, Number(ttl) || 15) * 60_000;
}
export const syncBackoffMs = (failures: number) =>
  Math.min(900_000, 60_000 * 2 ** Math.max(0, failures - 1));
