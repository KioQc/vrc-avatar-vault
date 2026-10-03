import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const directory = new URL('./public/', import.meta.url);
mkdirSync(directory, { recursive: true });
for (const name of ['index.html', 'dashboard.js', 'style.css'])
  copyFileSync(new URL(`../${name}`, import.meta.url), new URL(name, directory));
copyFileSync(
  new URL('../report-schema.mjs', import.meta.url),
  new URL('./schema.mjs', import.meta.url),
);
// Cloudflare-specific information, including provider-managed recovery history.
const page = new URL('index.html', directory);
writeFileSync(
  page,
  readFileSync(page, 'utf8').replace(
    'Conservation : 90 jours.',
    'Conservation : 90 jours. Hébergé par Cloudflare ; historique de restauration D1 jusqu’à 7 jours sur le plan gratuit.',
  ),
  'utf8',
);
