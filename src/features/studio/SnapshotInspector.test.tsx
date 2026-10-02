import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SnapshotInspector } from './SnapshotInspector';
import { parseVRChatAvatar } from '../../utils/domain';
import fixture from '../../fixtures/avatar-pc-quest.json';
import type { Avatar } from '../../types/domain';
import type { StudioSnapshot } from '../../types/studio';
vi.mock('../../hooks/useVault', () => ({ useSettings: () => ({ data: {} }) }));
const avatar = {
  id: 'qa',
  vrchat_id: fixture.id,
  archived: 0,
  favorite: 0,
  notes: '',
  local_cover_path: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  last_api_refresh_at: null,
  name: 'QA',
  data: parseVRChatAvatar(fixture),
  custom_version: '1.0.0',
  tags: [],
} as Avatar;
const data = {
  schemaVersion: 1,
  source: 'unity_editor_plugin',
  platform: 'PC',
  parameters: [
    { id: 'p', name: 'Glasses', type: 'Bool', saved: true, synced: true, defaultValue: false },
  ],
  menus: [
    {
      id: 'menu',
      name: 'Main',
      controls: [{ name: 'Glasses', type: 'Toggle', parameter: 'Glasses', value: 1 }],
    },
  ],
  hierarchy: [
    { id: 'root', path: 'Avatar', components: [{ type: 'Animator', id: 'a', properties: {} }] },
  ],
  controllers: [
    {
      id: 'fx',
      name: 'FX',
      parameters: [{ name: 'Glasses', type: 'Bool' }],
      layers: [{ name: 'Clothing', states: [{ name: 'On', transitions: [] }] }],
    },
  ],
  metrics: { triangles: 20000, materials: 3, textureMemoryBytes: 1024 },
  materials: [],
  textures: [],
  descriptor: { viewPosition: { x: 0, y: 1, z: 0 } },
};
const snapshots = [
  {
    id: 's',
    avatar_id: 'qa',
    kind: 'technical',
    label: 'QA capture',
    platform: 'PC',
    source: 'unity_editor_plugin',
    schema_version: 1,
    data_json: JSON.stringify(data),
    created_at: '2026-10-01T00:00:00Z',
    release_id: null,
  },
] as StudioSnapshot[];
describe('technical inspector views preserve captured data', () => {
  for (const tab of [
    'Parameters',
    'Menus',
    'Hierarchy',
    'FX',
    'Performance',
    'Platforms',
    'Descriptor',
    'Diff',
    'Quest checks',
  ])
    it(tab, () => {
      const html = renderToStaticMarkup(
        <SnapshotInspector avatar={avatar} snapshots={snapshots} initialTab={tab} />,
      );
      expect(html).toContain('QA capture');
      expect(html).not.toContain('No valid technical snapshot');
      if (tab === 'Parameters') expect(html).toContain('Glasses');
      if (tab === 'Performance') expect(html).toContain('20000');
    });
});
