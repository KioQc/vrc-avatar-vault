import process from 'node:process';
import { pathToFileURL } from 'node:url';

export async function checkDeployment(origin, fetcher = fetch) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin)
    throw new Error('Provide an HTTPS origin without credentials, path or query');
  const checks = [
    ['/health', 200],
    ['/owner/stats', 401],
    ['/', 200],
  ];
  for (const [path, expected] of checks) {
    const response = await fetcher(`${origin}${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== expected)
      throw new Error(`${path}: expected HTTP ${expected}, received ${response.status}`);
    if (!response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"))
      throw new Error(`${path}: missing frame protection`);
    if (response.headers.get('cache-control') !== 'no-store')
      throw new Error(`${path}: private cache policy missing`);
    if (!response.headers.get('strict-transport-security')?.includes('max-age='))
      throw new Error(`${path}: HTTPS policy missing`);
    if (path === '/health' && (await response.json()).ok !== true)
      throw new Error('Unexpected health response');
    else if (path !== '/health') await response.body?.cancel();
  }
  return { ok: true, checks: checks.length };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    console.log(await checkDeployment(process.argv[2] || ''));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
