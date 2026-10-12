import { z } from 'zod';
export const unityProjectSchema = z.object({
  name: z.string(),
  unityVersion: z.string().nullable(),
  sdkVersion: z.string().nullable(),
  source: z.literal('filesystem'),
  packages: z.array(
    z.object({
      name: z.string(),
      displayName: z.string().optional(),
      version: z.string(),
      source: z.string(),
      type: z.string(),
      origin: z.string().optional(),
      location: z.string().optional(),
      reference: z.string().optional(),
    }),
  ),
  warnings: z.array(z.string()),
});
export const unityDependencySnapshotSchema = z.object({
  path: z.string(),
  project: unityProjectSchema,
});
export type UnityProjectData = z.infer<typeof unityProjectSchema>;
