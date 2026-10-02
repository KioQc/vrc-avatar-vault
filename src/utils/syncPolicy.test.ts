import { it, expect } from 'vitest';
import { syncIntervalMs, syncFreshnessMs, syncBackoffMs } from './syncPolicy';
it('polls every 30 seconds without the normal 15 minute cache', () => {
  expect(syncIntervalMs('30s')).toBe(30000);
  expect(syncFreshnessMs('30s', '15')).toBe(30000);
  expect(syncFreshnessMs('1', '15')).toBe(900000);
});
it('preserves manual/startup schedules and backs off failures', () => {
  expect(syncIntervalMs('off')).toBeNull();
  expect(syncIntervalMs('startup')).toBeNull();
  expect(syncIntervalMs('1')).toBe(3600000);
  expect(syncBackoffMs(1)).toBe(60000);
  expect(syncBackoffMs(2)).toBe(120000);
  expect(syncBackoffMs(20)).toBe(900000);
});
