import { Monitor, Glasses, Smartphone, GitBranch } from 'lucide-react';
import { PerformanceRank } from './PerformanceRank';
import type { Avatar } from '../types/domain';
import { nativePerformance } from '../utils/domain';
import { Badge } from './common';
export function AvatarBadges({ avatar }: { avatar: Avatar }) {
  return (
    <div className="avatar-badges">
      {nativePerformance(avatar.data).map((p) => {
        const Icon = p.platform === 'PC' ? Monitor : p.platform === 'Quest' ? Glasses : Smartphone;
        const tone = ['Good', 'Excellent'].includes(p.rating)
          ? 'green'
          : p.rating === 'VeryPoor'
            ? 'danger'
            : p.rating === 'Poor'
              ? 'warning'
              : '';
        return (
          <div className="platform-group" key={p.platform}>
            <Badge
              tone={p.platform === 'PC' ? 'blue' : p.platform === 'Quest' ? 'green' : 'purple'}
            >
              <Icon size={12} />
              {p.platform}
            </Badge>
            <Badge title="Avatar revision returned by VRChat API">
              <GitBranch size={12} />
              API v{avatar.data.version}
            </Badge>
            <Badge tone={tone} title={`${p.platform} performanceRating: ${p.rating}`}>
              <PerformanceRank rating={p.rating} />
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
