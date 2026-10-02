import {
  apiAvatarSchema,
  avatarIdSchema,
  type ApiAvatar,
  type Change,
  type Difference,
  type OscData,
  type Release,
} from '../types/domain';
export const validateAvatarId = (value: string) => avatarIdSchema.safeParse(value.trim()).success;
export function versionedName(name: string, version: string) {
  return `${name.trim().replace(/\s+v\d+(?:\.\d+)*(?:-[\w.-]+)?(?:\+[\w.-]+)?$/i, '')} v${version}`;
}
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(password|cookie|token|authorization|secret)/i.test(key))
        .map(([key, v]) => [key, sanitize(v)]),
    );
  return value;
}
export const parseVRChatAvatar = (data: unknown): ApiAvatar =>
  apiAvatarSchema.parse(sanitize(data));
function stable(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify(v.map(stable).sort());
  if (v && typeof v === 'object')
    return JSON.stringify(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, stable(x)]),
    );
  return JSON.stringify(v) ?? 'null';
}
export function compareAvatarSnapshots(old: ApiAvatar, next: ApiAvatar) {
  const differences: Difference[] = [];
  for (const field of [
    'version',
    'name',
    'description',
    'releaseStatus',
    'imageUrl',
    'thumbnailImageUrl',
    'tags',
    'styles',
    'performance',
    'pendingUpload',
  ]) {
    if (stable(old[field]) !== stable(next[field]))
      differences.push({ field, oldValue: old[field], newValue: next[field] });
  }
  // Package IDs can change on upload. Match semantic platform + variant + Unity compatibility slot.
  const group = (a: ApiAvatar) =>
    a.unityPackages.reduce<Record<string, ApiAvatar['unityPackages']>>((g, p) => {
      (g[`${p.platform}/${p.variant || 'default'}/${p.unityVersion}`] ??= []).push(p);
      return g;
    }, {});
  const left = group(old),
    right = group(next);
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const simplify = (items: ApiAvatar['unityPackages'] | undefined) =>
      items?.map((p) => ({
        id: p.id,
        assetVersion: p.assetVersion,
        unityVersion: p.unityVersion,
        performanceRating: p.performanceRating,
        variant: p.variant,
        impostor: p.impostorizerVersion ?? p.impostorVersion ?? p.impostor ?? null,
        impostorAvailable: Boolean(p.impostorUrl),
      }));
    if (stable(simplify(left[key])) !== stable(simplify(right[key])))
      differences.push({
        field: `packages.${key}`,
        oldValue: simplify(left[key]) ?? null,
        newValue: simplify(right[key]) ?? null,
      });
  }
  return { changed: differences.length > 0, differences };
}
export const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export function validSemver(v: string) {
  const m = semverPattern.exec(v);
  return !!m && !m[4]?.split('.').some((p) => /^\d+$/.test(p) && p.length > 1 && p.startsWith('0'));
}
export function nextSemanticVersion(version: string, bump: 'major' | 'minor' | 'patch') {
  if (!validSemver(version)) throw new Error('Invalid semantic version');
  const [a, b, c] = version.split(/[.+-]/).slice(0, 3).map(Number);
  return bump === 'major'
    ? `${a + 1}.0.0`
    : bump === 'minor'
      ? `${a}.${b + 1}.0`
      : `${a}.${b}.${c + 1}`;
}
/** Component-wise addition, deliberately separate from SemVer's reset-on-bump rules. */
export function addVersionIncrement(version: string, increment: string): string {
  if (!validSemver(version) || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(increment))
    throw new Error('Use three non-negative integers, e.g. 0.1.0');
  const base = version.split(/[.+-]/).slice(0, 3).map(Number);
  const delta = increment.split('.').map(Number);
  const result = base.map((n, i) => n + delta[i]);
  if (!delta.some(Boolean) || [...base, ...delta, ...result].some((n) => !Number.isSafeInteger(n)))
    throw new Error('Use a positive increment within the supported integer range');
  return result.join('.');
}
export function groupChangesByCategory(changes: Change[]) {
  const result: Record<string, Change[]> = {};
  for (const c of changes)
    for (const category of c.categories.length ? c.categories : ['Other'])
      (result[category] ??= []).push(c);
  return result;
}
export function exportMarkdownChangelog(
  name: string,
  release: Release | null,
  changes: Change[],
  discord = false,
) {
  const icons: Record<string, string> = {
    Added: '✨ ',
    Changed: '🔧 ',
    Fixed: '🐛 ',
    Optimized: '⚡ ',
  };
  return (
    `${discord ? '##' : '#'} ${name} — ${release ? 'v' + release.version : 'Unreleased'}\n\n${release ? `Released ${release.released_at.slice(0, 10)}\n\n${release.description}\n\n` : ''}` +
    Object.entries(groupChangesByCategory(changes))
      .map(
        ([cat, rows]) =>
          `${discord ? '###' : '##'} ${discord ? (icons[cat] ?? '') : ''}${cat}\n${rows.map((c) => `- ${c.title}${c.description ? `\n  ${c.description.replace(/\n/g, '\n  ')}` : ''}`).join('\n')}`,
      )
      .join('\n\n')
  );
}
export function splitDiscord(text: string, limit = 2000) {
  if (limit < 2) throw new Error('Invalid message limit');
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let split = rest.lastIndexOf('\n', limit);
    if (split < limit / 2) split = limit;
    if (/[\uD800-\uDBFF]/.test(rest[split - 1] ?? '')) split--;
    chunks.push(rest.slice(0, split));
    rest = rest.slice(split).replace(/^\n/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}
export function compareOsc(old: OscData, next: OscData) {
  const a = new Map(old.parameters.map((p) => [p.name, p])),
    b = new Map(next.parameters.map((p) => [p.name, p]));
  return [...new Set([...a.keys(), ...b.keys()])].flatMap((name) =>
    stable(a.get(name)) === stable(b.get(name))
      ? []
      : [{ field: name, oldValue: a.get(name) ?? null, newValue: b.get(name) ?? null }],
  );
}
export const platformName = (p: string) =>
  ({ standalonewindows: 'PC', android: 'Quest', ios: 'iOS' })[p] ?? p;
export const isImpostorPackage = (p: ApiAvatar['unityPackages'][number]) =>
  p.variant.toLowerCase() === 'impostor';
export const nativePackages = (a: ApiAvatar) =>
  a.unityPackages.filter((p) => !isImpostorPackage(p));
export const platforms = (a: ApiAvatar) => [
  ...new Set(nativePackages(a).map((p) => platformName(p.platform))),
];
export const performanceLabel = (rating: string) =>
  ({ VeryPoor: 'Very Poor', None: 'Not rated', Unknown: 'Unknown' })[rating] ?? rating;
export function nativePerformance(a: ApiAvatar) {
  const packages = nativePackages(a);
  const performance =
    a.performance && typeof a.performance === 'object'
      ? (a.performance as Record<string, unknown>)
      : {};
  return [...new Set(packages.map((p) => p.platform))].map((platform) => {
    const top = performance[platform];
    const known = (v: unknown): v is string =>
      typeof v === 'string' && !['none', 'unknown', ''].includes(v.toLowerCase());
    const rating = known(top)
      ? top
      : (packages.find((p) => p.platform === platform && known(p.performanceRating))
          ?.performanceRating ?? 'Unknown');
    return { platform: platformName(platform), rating, label: performanceLabel(rating) };
  });
}
