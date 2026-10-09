import type { UnityPackage } from '../types/domain';
// VRChat Creation rank limits, checked 2026-10-09. Per-metric guidance, not an overall rank.
const pc: Record<string, number[]> = {
  totalPolygons: [32000, 70000, 70000, 70000],
  totalTextureUsage: [40, 75, 110, 150].map((v) => v * 1048576),
  skinnedMeshCount: [1, 2, 8, 16],
  meshCount: [4, 8, 16, 24],
  materialSlotsUsed: [4, 8, 16, 32],
  boneCount: [75, 150, 256, 400],
  physBoneComponentCount: [4, 8, 16, 32],
  physBoneTransformCount: [16, 64, 128, 256],
  physBoneColliderCount: [4, 8, 16, 32],
  physBoneCollisionCheckCount: [32, 128, 256, 512],
  contactCount: [8, 16, 24, 32],
  constraintCount: [100, 250, 300, 350],
  constraintDepth: [20, 50, 80, 100],
  animatorCount: [1, 4, 16, 32],
  particleSystemCount: [0, 4, 8, 16],
  totalMaxParticles: [0, 300, 1000, 2500],
  meshParticleMaxPolygons: [0, 1000, 2000, 5000],
  lightCount: [0, 0, 0, 1],
  audioSourceCount: [1, 4, 8, 8],
  clothCount: [0, 1, 1, 1],
  totalClothVertices: [0, 50, 100, 200],
  trailRendererCount: [1, 2, 4, 8],
  lineRendererCount: [1, 2, 4, 8],
  physicsColliders: [0, 1, 8, 8],
  physicsRigidbodies: [0, 1, 8, 8],
  raycastCount: [1, 4, 8, 15],
  particleTrailsEnabled: [0, 0, 1, 1],
  particleCollisionEnabled: [0, 0, 1, 1],
};
const mobile: Record<string, number[]> = {
  totalPolygons: [7500, 10000, 15000, 20000],
  totalTextureUsage: [10, 18, 25, 40].map((v) => v * 1048576),
  skinnedMeshCount: [1, 1, 2, 2],
  meshCount: [1, 1, 2, 2],
  materialSlotsUsed: [1, 1, 2, 4],
  boneCount: [75, 90, 150, 150],
  physBoneComponentCount: [0, 4, 6, 8],
  physBoneTransformCount: [0, 16, 32, 64],
  physBoneColliderCount: [0, 4, 8, 16],
  physBoneCollisionCheckCount: [0, 16, 32, 64],
  contactCount: [2, 4, 8, 16],
  constraintCount: [30, 60, 120, 150],
  constraintDepth: [5, 15, 35, 50],
  animatorCount: [1, 1, 1, 2],
  particleSystemCount: [0, 0, 0, 2],
  totalMaxParticles: [0, 0, 0, 200],
  meshParticleMaxPolygons: [0, 0, 0, 400],
  trailRendererCount: [0, 0, 0, 1],
  lineRendererCount: [0, 0, 0, 1],
  raycastCount: [1, 2, 4, 8],
  particleTrailsEnabled: [0, 0, 0, 1],
  particleCollisionEnabled: [0, 0, 0, 1],
};
export function metricRank(platform: string, key: string, value: unknown): string | null {
  if (!['standalonewindows', 'android', 'ios'].includes(platform)) return null;
  if (key === 'bounds') {
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      !value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    )
      return null;
    const index = [
      [2.5, 2.5, 2.5],
      [4, 4, 4],
      [5, 6, 5],
      [5, 6, 5],
    ].findIndex((limit) => value.every((v, i) => v <= limit[i] + 0.001));
    return ['Excellent', 'Good', 'Medium', 'Poor'][index] ?? 'VeryPoor';
  }
  const limits = (platform === 'standalonewindows' ? pc : mobile)[key];
  const n = typeof value === 'boolean' ? Number(value) : value;
  if (!limits || typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return (
    ['Excellent', 'Good', 'Medium', 'Poor'][limits.findIndex((limit) => n <= limit)] ?? 'VeryPoor'
  );
}
export function analysisReference(pkg: UnityPackage) {
  if (typeof pkg.assetUrl !== 'string') return null;
  const match =
    /^https:\/\/(?:api\.vrchat\.cloud|api\.vrchat\.com)\/api\/1\/file\/(file_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(\d+)\/(?:file|variant\/security)$/i.exec(
      pkg.assetUrl,
    );
  if (!match || Number(match[2]) < 1 || !Number.isSafeInteger(Number(match[2]))) return null;
  return {
    id: match[1],
    version: Number(match[2]),
    variant: pkg.variant === 'security' ? 'security' : 'standard',
  };
}
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function metricValue(value: unknown, format = 'number') {
  if (format === 'bounds')
    return Array.isArray(value) &&
      value.length === 3 &&
      value.every((v) => typeof v === 'number' && Number.isFinite(v))
      ? value.map((v) => Number(v.toFixed(2))).join(' × ') + ' m'
      : '—';
  if (format === 'bool') return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : '—';
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  return format === 'bytes' ? `${(value / 1048576).toFixed(2)} MB` : value.toLocaleString();
}
