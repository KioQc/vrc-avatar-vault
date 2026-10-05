import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import console from 'node:console';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/);
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
assert.equal(config.version, version);
const name = `VRC-Avatar-Vault-${version}-Setup.exe`;
const buildDir = `release/build/${version.split('.').slice(0, 2).join('.')}.x/${version}`;
const bytes = readFileSync(`${buildDir}/${name}`);
const signature = readFileSync(`${buildDir}/${name}.sig`, 'utf8').trim();
assert(
  Buffer.from(signature, 'base64').toString().includes(`\tversion:${version}\n`),
  'Signature must bind this release version',
);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const manifest = {
  version,
  notes: readFileSync(`docs/RELEASE-${version}.txt`, 'utf8').trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      size: bytes.length,
      sha256,
      url: `https://github.com/KioQc/vrc-avatar-vault/releases/download/v${version}/${name}`,
    },
  },
};
writeFileSync('release/latest.json.tmp', JSON.stringify(manifest, null, 2) + '\n');
renameSync('release/latest.json.tmp', 'release/latest.json');
writeFileSync(`release/SHA256SUMS-${version}.txt`, `${sha256}  ${name}\n`);
console.log(`Generated latest.json with size, SHA-256 and version-bound signature for ${version}`);
