import { it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './Dashboard';
import { Avatars } from './Avatars';
import { WorkspaceTools } from './WorkspaceTools';
import { Settings } from './Settings';
import { VRChatCenter } from './VRChatCenter';
import { Changelogs, Activity, Tags } from './Collections';
import { parseVRChatAvatar } from '../utils/domain';
import fixture from '../fixtures/avatar-pc-quest.json';
vi.stubGlobal('navigator', { onLine: true });
const avatar = {
  id: 'qa',
  vrchat_id: fixture.id,
  name: 'QA Avatar',
  data: parseVRChatAvatar(fixture),
  custom_version: '1.0.0',
  tags: [],
  archived: 0,
  favorite: 0,
  notes: '',
  local_cover_path: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  last_api_refresh_at: null,
};
for (const [name, element, path] of [
  ['Overview', <Dashboard />, '/'],
  ['Library grid', <Avatars />, '/avatars'],
  ['Library list', <Avatars />, '/avatars?view=list'],
  ['Favorites empty', <Avatars />, '/avatars?filter=Favorites'],
  ['Settings', <Settings />, '/settings'],
  ['VRChat session', <VRChatCenter />, '/vrchat'],
  ['Changelogs', <Changelogs />, '/changelogs'],
  ['Activity', <Activity />, '/activity'],
  ['Tags', <Tags />, '/tags'],
  ...['bugs', 'work', 'snapshots', 'dependencies'].map((t) => [
    t,
    <WorkspaceTools />,
    `/workspace/${t}`,
  ]),
] as const) {
  it(`renders ${name} without discarding existing data`, () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['avatars'], [avatar]);
    client.setQueryData(['settings'], {});
    client.setQueryData(['workspace-summary'], { avatars: [], work: [], presence: null });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path as string]}>
          <Routes>
            <Route path="/workspace/:tool" element={element} />
            <Route path="*" element={element} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html.length).toBeGreaterThan(100);
    expect(client.getQueryData(['avatars'])).toEqual([avatar]);
    client.clear();
  });
}
