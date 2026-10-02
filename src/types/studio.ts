import { z } from 'zod';
const node = z.record(z.string(), z.unknown());
export const technicalSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.enum(['unity_editor_plugin', 'unity_asset_parser']),
    platform: z.enum(['PC', 'Quest', 'iOS', 'Unknown']),
    capturedAt: z.string().optional(),
    unityVersion: z.string().optional(),
    avatarName: z.string().optional(),
    blueprintId: z.string().optional(),
    hierarchy: z.array(node).max(20000).nullable().optional(),
    parameters: z.array(node).max(20000).nullable().optional(),
    menus: z.array(node).max(20000).nullable().optional(),
    controllers: z.array(node).max(20000).nullable().optional(),
    descriptor: node.nullable().optional(),
    metrics: z.record(z.string(), z.number().finite().nonnegative()).nullable().optional(),
    materials: z.array(node).nullable().optional(),
    textures: z.array(node).nullable().optional(),
    performanceRating: z.string().nullable().optional(),
  })
  .passthrough();
export type TechnicalData = z.infer<typeof technicalSchema>;
export interface StudioSnapshot {
  id: string;
  avatar_id: string;
  release_id: string | null;
  kind: string;
  label: string;
  platform: string;
  source: string;
  schema_version: number;
  data_json: string;
  created_at: string;
}
export interface Bug {
  id: string;
  avatar_id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  found_version: string;
  target_version: string;
  steps: string;
  expected: string;
  actual: string;
  known_issue: number;
  attachment_ids: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}
export interface WorkSession {
  id: string;
  avatar_id: string;
  version: string;
  description: string;
  status: string;
  started_at: string;
  heartbeat_at: string;
  ended_at: string | null;
  duration_seconds: number;
}
export interface FileChange {
  type: string;
  path: string;
  kind: string;
  oldPath?: string;
}
export interface ScanData {
  source: string;
  schemaVersion: number;
  projectPath: string;
  files: Record<string, { size: number; modified: number; hash: string | null; kind: string }>;
  changes: FileChange[];
  hasBaseline: boolean;
}
export interface Batch {
  id: string;
  avatar_id: string;
  started_at: string;
  updated_at: string;
  status: string;
  data_json: string;
}
export const bugStatuses = ['Open', 'Investigating', 'Testing', 'Fixed', "Won't Fix", 'Duplicate'];
export const openBug = (b: Bug) => !['Fixed', "Won't Fix", 'Duplicate'].includes(b.status);
