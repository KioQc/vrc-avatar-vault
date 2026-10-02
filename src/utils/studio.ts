import type { FileChange, TechnicalData } from '../types/studio';
export const defaultRules = {
  version: '2026-10-v1',
  parameterBudget: 256,
  boolBits: 1,
  numericBits: 8,
  textureWarning: 1024,
  materialWarning: 4,
  regressionPercent: 25,
};
export function rulesFrom(value?: string) {
  try {
    const p = JSON.parse(value ?? '{}');
    const result = { ...defaultRules };
    for (const key of [
      'parameterBudget',
      'boolBits',
      'numericBits',
      'textureWarning',
      'materialWarning',
      'regressionPercent',
    ] as const) {
      if (Number.isFinite(p[key]) && p[key] > 0 && p[key] <= 1000000) result[key] = p[key];
    }
    return result;
  } catch {
    return defaultRules;
  }
}
export function parameterCost(p: Record<string, unknown>, rules = defaultRules) {
  if (p.synced === false) return 0;
  if (p.synced !== true) return null;
  return p.type === 'Bool'
    ? rules.boolBits
    : ['Int', 'Float'].includes(String(p.type))
      ? rules.numericBits
      : null;
}
export function suggestions(changes: FileChange[]) {
  const groups = [
    {
      title: 'Updated expression and animation system',
      types: ['controller', 'overridecontroller', 'anim'],
    },
    {
      title: 'Updated visual materials and textures',
      types: ['mat', 'png', 'jpg', 'jpeg', 'webp', 'psd', 'shader'],
    },
    { title: 'Updated avatar structure', types: ['prefab', 'unity'] },
    { title: 'Updated avatar asset configuration', types: ['asset'] },
  ];
  return groups
    .map((g) => ({ title: g.title, evidence: changes.filter((c) => g.types.includes(c.kind)) }))
    .filter((g) => g.evidence.length);
}
export interface StudioDiff {
  kind: 'Added' | 'Removed' | 'Changed' | 'Moved';
  path: string;
  before: unknown;
  after: unknown;
}
export function structuredDiff(before: unknown, after: unknown, prefix = ''): StudioDiff[] {
  const out: StudioDiff[] = [];
  function visit(a: unknown, b: unknown, path: string, depth: number) {
    if (JSON.stringify(a) === JSON.stringify(b) || out.length >= 1000) return;
    if (a === undefined || b === undefined) {
      out.push({ kind: a === undefined ? 'Added' : 'Removed', path, before: a, after: b });
      return;
    }
    if (depth > 12) {
      out.push({ kind: 'Changed', path, before: a, after: b });
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const key = (x: unknown, i: number) =>
        x && typeof x === 'object'
          ? String((x as Record<string, unknown>).id ?? (x as Record<string, unknown>).name ?? i)
          : String(i);
      const duplicate = (items: unknown[]) => new Set(items.map(key)).size !== items.length;
      const indexed = duplicate(a) || duplicate(b);
      const left = new Map(a.map((x, i) => [indexed ? String(i) : key(x, i), x])),
        right = new Map(b.map((x, i) => [indexed ? String(i) : key(x, i), x]));
      for (const k of new Set([...left.keys(), ...right.keys()]))
        visit(left.get(k), right.get(k), `${path}/${k}`, depth + 1);
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const aa = a as Record<string, unknown>,
        bb = b as Record<string, unknown>;
      for (const key of new Set([...Object.keys(aa), ...Object.keys(bb)])) {
        if (['capturedAt', 'schemaVersion'].includes(key)) continue;
        visit(aa[key], bb[key], `${path}/${key}`, depth + 1);
      }
      return;
    }
    out.push({
      kind: path.endsWith('/parentId') || path.endsWith('/path') ? 'Moved' : 'Changed',
      path,
      before: a,
      after: b,
    });
  }
  visit(before, after, prefix, 0);
  return out;
}
export function questChecks(data: TechnicalData, rules = defaultRules) {
  const checks: { id: string; severity: string; where: string; message: string }[] = [];
  if (data.materials)
    for (const m of data.materials) {
      if (typeof m.shader === 'string' && !m.shader.startsWith('VRChat/Mobile/'))
        checks.push({
          id: 'QUEST_SHADER_DESKTOP_ONLY',
          severity: 'Error',
          where: String(m.path ?? m.name),
          message: `Shader ${m.shader} is outside VRChat/Mobile. Android avatars require SDK mobile shaders.`,
        });
    }
  if (data.textures)
    for (const t of data.textures) {
      if (Number(t.width) > rules.textureWarning || Number(t.height) > rules.textureWarning)
        checks.push({
          id: 'QUEST_TEXTURE_LARGE',
          severity: 'Warning',
          where: String(t.name),
          message: `Texture exceeds the configured ${rules.textureWarning}px recommendation. Review memory usage.`,
        });
    }
  if (data.metrics?.materials !== undefined && data.metrics.materials > rules.materialWarning)
    checks.push({
      id: 'QUEST_TOO_MANY_MATERIALS',
      severity: 'Warning',
      where: 'Avatar renderers',
      message: `${data.metrics.materials} material slots; configured recommendation ${rules.materialWarning}.`,
    });
  if (data.metrics?.lights)
    checks.push({
      id: 'QUEST_UNSUPPORTED_COMPONENT',
      severity: 'Warning',
      where: 'Lights',
      message: `${data.metrics.lights} lights reported. Review Android component restrictions.`,
    });
  return checks;
}
export function significantChanges(
  a: Record<string, number>,
  b: Record<string, number>,
  percent = 25,
) {
  return Object.keys(b)
    .filter(
      (k) =>
        a[k] !== undefined &&
        a[k] !== b[k] &&
        (a[k] === 0 || Math.abs(((b[k] - a[k]) / a[k]) * 100) >= percent),
    )
    .map((k) => ({
      metric: k,
      before: a[k],
      after: b[k],
      percent: a[k] ? Math.round(((b[k] - a[k]) / a[k]) * 100) : null,
    }));
}
export const durationText = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${Math.floor(seconds % 60)}s`;
