import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnlineUpdateCenter, type OnlineStatus } from './OnlineUpdateCenter';

function render(status: OnlineStatus) {
  const client = new QueryClient();
  client.setQueryData(['settings'], {});
  client.setQueryData(['online-updates'], status);
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <OnlineUpdateCenter />
    </QueryClientProvider>,
  );
  client.clear();
  return html;
}
it('does not call an unconfigured build up to date', () => {
  const html = render({ configured: false, available: false });
  expect(html).toContain('not configured');
  expect(html).not.toContain('latest published version');
});
it('requires a verified download before offering installation', () => {
  const html = render({ configured: true, available: true, ready: false, version: '0.9.0' });
  expect(html).toContain('Download update');
  expect(html).not.toContain('Install &amp; restart');
});
it('offers installation only when the native updater marks the package ready', () => {
  const html = render({ configured: true, available: true, ready: true, version: '0.9.0' });
  expect(html).toContain('verified and ready to install');
  expect(html).toContain('Install &amp; restart');
});
it('escapes GitHub release notes', () => {
  const html = render({ configured: true, available: true, notes: '<script>alert(1)</script>' });
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});
