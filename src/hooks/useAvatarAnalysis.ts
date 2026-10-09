import { useQueries } from '@tanstack/react-query';
import { vrchat } from '../api/VRChatApiClient';
import { useOnline } from './useOnline';
import { useUI } from '../stores/ui';
import type { Avatar } from '../types/domain';
import { nativePackages } from '../utils/domain';
import { analysisReference } from '../utils/performance';

export function avatarAnalysisOptions(ref: NonNullable<ReturnType<typeof analysisReference>>) {
  return {
    queryKey: ['avatar-analysis', ref.id, ref.version, ref.variant],
    queryFn: () => vrchat.getFileAnalysis(ref.id, ref.version, ref.variant),
    staleTime: 15 * 60000,
    gcTime: 30 * 60000,
    retry: false as const,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  };
}
export function avatarAnalysisPackages(avatar: Avatar['data']) {
  const packages = nativePackages(avatar);
  return [...new Set(packages.map((p) => p.platform))].map(
    (platform) =>
      packages
        .filter((p) => p.platform === platform)
        .sort(
          (a, b) =>
            (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) ||
            Number(b.variant === 'security') - Number(a.variant === 'security'),
        )[0],
  );
}
export function useAvatarAnalysis(avatar?: Avatar) {
  const online = useOnline();
  const user = useUI((s) => s.user);
  const refs = avatar
    ? avatarAnalysisPackages(avatar.data)
        .map(analysisReference)
        .filter((ref) => ref !== null)
    : [];
  return useQueries({
    queries: refs.map((ref) => ({ ...avatarAnalysisOptions(ref), enabled: online && !!user })),
  });
}
