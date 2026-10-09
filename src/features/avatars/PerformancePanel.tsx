import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { vrchat } from '../../api/VRChatApiClient';
import type { Avatar } from '../../types/domain';
import { nativePackages, nativePerformance, platformName } from '../../utils/domain';
import { analysisReference, metricValue, metricRank, record } from '../../utils/performance';
import { PerformanceRank } from '../../components/PerformanceRank';
import { Button } from '../../components/ui/button';
import { ErrorNotice } from '../../components/common';
const groups: [string, [string, string, string?][]][] = [
  [
    'Geometry',
    [
      ['totalPolygons', 'Triangles'],
      ['totalVertices', 'Vertices'],
      ['skinnedMeshCount', 'Skinned meshes'],
      ['meshCount', 'Basic meshes'],
      ['materialSlotsUsed', 'Material slots'],
      ['boneCount', 'Bones'],
      ['blendShapeCount', 'Blend shapes'],
      ['bounds', 'Bounds', 'bounds'],
    ],
  ],
  [
    'Dynamics and constraints',
    [
      ['physBoneComponentCount', 'PhysBone components'],
      ['physBoneTransformCount', 'PhysBone affected transforms'],
      ['physBoneColliderCount', 'PhysBone colliders'],
      ['physBoneCollisionCheckCount', 'PhysBone collision checks'],
      ['contactCount', 'Contacts'],
      ['constraintCount', 'Constraints'],
      ['constraintDepth', 'Constraint depth'],
    ],
  ],
  [
    'Components and effects',
    [
      ['animatorCount', 'Animators'],
      ['particleSystemCount', 'Particle systems'],
      ['totalMaxParticles', 'Maximum particles'],
      ['meshParticleMaxPolygons', 'Mesh particle triangles'],
      ['lightCount', 'Lights'],
      ['audioSourceCount', 'Audio sources'],
      ['clothCount', 'Cloths'],
      ['totalClothVertices', 'Cloth vertices'],
      ['trailRendererCount', 'Trail renderers'],
      ['lineRendererCount', 'Line renderers'],
      ['physicsColliders', 'Physics colliders'],
      ['physicsRigidbodies', 'Rigidbodies'],
      ['particleTrailsEnabled', 'Particle trails', 'bool'],
      ['particleCollisionEnabled', 'Particle collision', 'bool'],
    ],
  ],
];
export function PerformancePanel({ avatar }: { avatar: Avatar }) {
  const packages = nativePackages(avatar.data);
  const platforms = [...new Set(packages.map((p) => p.platform))];
  const [selected, setSelected] = useState(platforms[0] ?? 'standalonewindows');
  const platform = platforms.includes(selected) ? selected : platforms[0];
  const pkg = packages
    .filter((p) => p.platform === platform)
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        (a.variant === 'security' ? -1 : b.variant === 'security' ? 1 : 0),
    )[0];
  const ref = pkg ? analysisReference(pkg) : null;
  const query = useQuery({
    queryKey: ['avatar-analysis', ref?.id, ref?.version, ref?.variant],
    queryFn: () => vrchat.getFileAnalysis(ref!.id, ref!.version, ref!.variant),
    enabled: false,
    staleTime: 15 * 60000,
    retry: false,
  });
  const analysis = record(query.data);
  const stats = record(analysis.avatarStats);
  const rating =
    typeof analysis.performanceRating === 'string'
      ? analysis.performanceRating
      : (nativePerformance(avatar.data).find((p) => p.platform === platformName(platform ?? ''))
          ?.rating ?? 'Unknown');
  return (
    <div className="performance-detail">
      <div className="row between wrap">
        <h2>VRChat performance</h2>
        <div className="row wrap">
          {platforms.map((p) => (
            <Button
              key={p}
              variant={p === platform ? 'default' : 'secondary'}
              onClick={() => setSelected(p)}
            >
              {platformName(p)}
            </Button>
          ))}
          <Button disabled={!ref || query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching
              ? 'Loading…'
              : query.isError
                ? 'Retry analysis'
                : 'Fetch VRChat analysis'}
          </Button>
        </div>
      </div>
      <p className="tiny muted">
        Uploaded build analysis · VRChat API. Unity snapshot measurements remain separate. Missing
        values are shown as —.
      </p>
      {query.error && <ErrorNotice error={query.error} />}
      {!query.data && (
        <p className="notice">
          {ref
            ? 'Load the analysis for this uploaded build. Recent uploads may still be processing or unavailable.'
            : 'No analysable native file is available for this platform.'}
        </p>
      )}
      <section className="panel performance-section">
        <h3>Performance · {platformName(platform ?? 'unknown')}</h3>
        <div className="performance-metrics">
          <div className="performance-metric">
            <span>Rating</span>
            <PerformanceRank rating={rating} />
          </div>
          {(
            [
              ['fileSize', 'Download size'],
              ['uncompressedSize', 'Uncompressed size'],
            ] as const
          ).map(([key, label]) => (
            <div className="performance-metric" key={key}>
              <span>{label}</span>
              <strong>{metricValue(analysis[key], 'bytes')}</strong>
            </div>
          ))}
          <Metric
            platform={platform}
            label="Texture memory"
            field="totalTextureUsage"
            value={stats.totalTextureUsage}
            format="bytes"
          />
        </div>
      </section>
      {groups.map(([title, fields]) => (
        <section className="panel performance-section" key={title}>
          <h3>
            {title} · {platformName(platform ?? 'unknown')}
          </h3>
          <div className="performance-metrics">
            {fields.map(([key, label, format]) => (
              <Metric
                key={key}
                platform={platform}
                label={label}
                field={key}
                value={stats[key]}
                format={format}
              />
            ))}
          </div>
        </section>
      ))}
      <a
        className="tiny muted"
        href="https://creators.vrchat.com/avatars/avatar-performance-ranking-system/"
        target="_blank"
        rel="noreferrer"
      >
        Per-metric limits: VRChat Creation · checked October 2026
      </a>
    </div>
  );
}
function Metric({
  platform,
  label,
  field,
  value,
  format,
}: {
  platform: string;
  label: string;
  field: string;
  value: unknown;
  format?: string;
}) {
  const rank = metricRank(platform, field, value);
  return (
    <div className="performance-metric">
      <span>{label}</span>
      <strong
        className={`performance-rank rank-${rank?.toLowerCase()}`}
        title={rank ? `Per-metric guidance: ${rank}` : undefined}
      >
        {metricValue(value, format)}
        {rank && <PerformanceRank rating={rank} compact />}
      </strong>
    </div>
  );
}
