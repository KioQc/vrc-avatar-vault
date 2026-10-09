import { performanceLabel } from '../utils/domain';
export function PerformanceRank({
  rating,
  compact = false,
}: {
  rating: string;
  compact?: boolean;
}) {
  const rank = rating.replace(/\s/g, '').toLowerCase();
  const known = ['excellent', 'good', 'medium', 'poor', 'verypoor'].includes(rank);
  return (
    <span className={`performance-rank rank-${rank}`} title={performanceLabel(rating)}>
      {known && rank !== 'excellent' ? (
        <img src={`/performance-ranks/${rank}.png`} width="15" height="15" alt="" />
      ) : (
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          {rank === 'excellent' ? (
            <path
              fill="currentColor"
              d="m10 4 1.8 3.8 4.2.6-3 3 .7 4.2-3.7-2-3.7 2 .7-4.2-3-3 4.2-.6z"
            />
          ) : rank === 'verypoor' ? (
            <path stroke="currentColor" strokeWidth="3" d="M10 5v7m0 2v1" />
          ) : known ? (
            <circle
              cx="10"
              cy="10"
              r={rank === 'good' ? 3 : 5}
              fill={rank === 'poor' ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            />
          ) : (
            <text x="10" y="14" textAnchor="middle" fill="currentColor" fontSize="12">
              ?
            </text>
          )}
        </svg>
      )}
      {!compact && performanceLabel(rating)}
    </span>
  );
}
