import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('../../db/bridge', () => ({ desktop: true, mockMode: false }));
import { StartupGate, Diagnostics } from './Diagnostics';

it('keeps the workspace closed when startup reports a database failure', () => {
  const client = new QueryClient();
  client.setQueryData(['startup'], { error: 'Database schema is newer than this app' });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <StartupGate>
        <p>PRIVATE WORKSPACE</p>
      </StartupGate>
    </QueryClientProvider>,
  );
  expect(html).toContain('has not been deleted or recreated');
  expect(html).toContain('Open backups folder');
  expect(html).not.toContain('PRIVATE WORKSPACE');
  client.clear();
});
it('opens the workspace after a successful startup', () => {
  const client = new QueryClient();
  client.setQueryData(['startup'], { error: null });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <StartupGate>
        <p>WORKSPACE</p>
      </StartupGate>
    </QueryClientProvider>,
  );
  expect(html).toContain('WORKSPACE');
  expect(html).not.toContain('could not be opened');
  client.clear();
});
it('offers diagnostics explicitly without claiming an untested database is healthy', () => {
  const client = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Diagnostics />
    </QueryClientProvider>,
  );
  expect(html).toContain('Copy diagnostics');
  expect(html).toContain('Export support bundle');
  expect(html).not.toContain('Database: OK');
  client.clear();
});
