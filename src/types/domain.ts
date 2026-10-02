import { z } from 'zod';
export const avatarIdSchema = z
  .string()
  .regex(
    /^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Use an avtr_ UUID',
  );
export const categories = [
  'Added',
  'Changed',
  'Fixed',
  'Removed',
  'Optimized',
  'Quest',
  'PC',
  'Face Tracking',
  'PhysBones',
  'Textures',
  'Materials',
  'Animation',
  'FX',
  'Parameters',
  'Menu',
  'Other',
] as const;
export const packageSchema = z
  .object({
    id: z.string().catch(''),
    platform: z.string().catch('unknown'),
    assetVersion: z.number().catch(0),
    unityVersion: z.string().catch('Unknown'),
    performanceRating: z.string().catch('Unknown'),
    created_at: z.string().catch(''),
    variant: z.string().catch(''),
  })
  .passthrough();
export const apiAvatarSchema = z
  .object({
    id: avatarIdSchema,
    name: z.string().min(1),
    description: z.string().catch(''),
    authorId: z.string().catch(''),
    authorName: z.string().catch('Unknown'),
    imageUrl: z.string().catch(''),
    thumbnailImageUrl: z.string().catch(''),
    releaseStatus: z.string().catch('unknown'),
    version: z.number().int().nonnegative().catch(0),
    created_at: z.string().catch(''),
    updated_at: z.string().catch(''),
    tags: z.array(z.string()).catch([]),
    styles: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).catch({}),
    unityPackages: z.array(packageSchema).catch([]),
    featured: z.boolean().catch(false),
    searchable: z.boolean().catch(false),
    pendingUpload: z.boolean().catch(false),
    performance: z.unknown().optional(),
  })
  .passthrough();
export type ApiAvatar = z.infer<typeof apiAvatarSchema>;
export type UnityPackage = z.infer<typeof packageSchema>;
export interface Avatar {
  id: string;
  vrchat_id: string | null;
  name: string;
  custom_version: string;
  archived: number;
  favorite: number;
  notes: string;
  local_cover_path: string | null;
  created_at: string;
  updated_at: string;
  last_api_refresh_at: string | null;
  data: ApiAvatar;
  tags: string[];
}
export interface Change {
  id: string;
  avatar_id: string;
  release_id: string | null;
  title: string;
  description: string;
  importance: ChangeInput['importance'];
  platform: ChangeInput['platform'];
  created_at: string;
  updated_at: string;
  categories: ChangeInput['categories'];
}
export interface Release {
  id: string;
  avatar_id: string;
  version: string;
  title: string;
  description: string;
  released_at: string;
  created_at: string;
}
export interface Todo {
  id: string;
  avatar_id: string;
  title: string;
  priority: string;
  completed: number;
  created_at: string;
}
export interface Attachment {
  id: string;
  avatar_id: string;
  changelog_entry_id: string | null;
  path: string;
  type: string;
  caption: string;
  created_at: string;
}
export interface Snapshot {
  id: string;
  avatar_id: string;
  vrchat_version: number;
  created_at: string;
  snapshot_json?: string;
}
export interface Activity {
  id: string;
  avatar_id: string | null;
  type: string;
  message: string;
  created_at: string;
}
export interface Difference {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}
export interface User {
  id?: string;
  displayName?: string;
  imageUrl?: string;
  requiresTwoFactorAuth?: string[] | null;
}
export const oscSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    parameters: z.array(
      z
        .object({
          name: z.string(),
          input: z.object({ address: z.string(), type: z.string() }).optional(),
          output: z.object({ address: z.string(), type: z.string() }).optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export type OscData = z.infer<typeof oscSchema>;
export const changeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000),
  importance: z.enum(['Minor', 'Normal', 'Major', 'Breaking']),
  platform: z.enum(['All', 'PC', 'Quest', 'Other']),
  created_at: z.string().min(1),
  categories: z.array(z.enum(categories)).min(1),
  release_id: z.string().nullable(),
});
export type ChangeInput = z.infer<typeof changeSchema>;
