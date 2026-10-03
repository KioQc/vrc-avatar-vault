const operations = [
  'login',
  'session',
  'profile',
  'world',
  'verify2fa',
  'logout',
  'avatar',
  'rename_avatar',
];
const outcomes = ['ok', 'client', 'server', 'rate_limit', 'timeout', 'network'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const exact = (o, keys) =>
  o &&
  typeof o === 'object' &&
  !Array.isArray(o) &&
  Object.keys(o).sort().join() === [...keys].sort().join();
export function validate(value) {
  if (
    !exact(value, ['schema', 'session', 'day', 'version', 'metrics']) ||
    value.schema !== 1 ||
    !Number.isSafeInteger(value.day) ||
    value.day < 0 ||
    value.day > 100000 ||
    !uuid.test(value.session) ||
    typeof value.version !== 'string' ||
    !/^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[a-zA-Z0-9.-]{1,30})?$/.test(value.version) ||
    !Array.isArray(value.metrics) ||
    value.metrics.length > 48
  )
    return false;
  const seen = new Set();
  return value.metrics.every((m) => {
    if (
      !exact(m, ['operation', 'outcome', 'count', 'milliseconds']) ||
      !operations.includes(m.operation) ||
      !outcomes.includes(m.outcome) ||
      !Number.isSafeInteger(m.count) ||
      m.count < 1 ||
      m.count > 1000000 ||
      !Number.isSafeInteger(m.milliseconds) ||
      m.milliseconds < 0 ||
      m.milliseconds > m.count * 60000
    )
      return false;
    const key = `${m.operation}:${m.outcome}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
