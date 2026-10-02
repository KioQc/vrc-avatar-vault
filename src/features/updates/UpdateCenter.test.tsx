import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UpdateCenter, type UpdateStatus } from './UpdateCenter';

function render(status: Partial<UpdateStatus>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['settings'], {});
  client.setQueryData(['app-updates'], {
    current: '0.7.0',
    folder: '',
    available: false,
    release: null,
    ...status,
  });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <UpdateCenter />
    </QueryClientProvider>,
  );
  client.clear();
  return html;
}
it('explains that a folder must be selected and online downloads are not configured', () => {
  const html = render({});
  expect(html).toContain('No folder selected');
  expect(html).toContain('This section only reads local update packages');
});
it('shows the available package and escapes untrusted release notes', () => {
  const html = render({
    available: true,
    release: {
      version: '0.8.0',
      installer: 'update.exe',
      sha256: 'a'.repeat(64),
      size: 1024,
      notes: '<script>bad()</script>',
    },
  });
  expect(html).toContain('Version 0.8.0 is available');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});
it('reports missing manifests instead of claiming the app is up to date', () => {
  const html = render({
    folder: 'C:\\Updates',
    warning: 'No latest.vault-update.json found in this folder',
  });
  expect(html).toContain('No latest.vault-update.json');
  expect(html).not.toContain('No newer version');
});
