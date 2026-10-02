import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.argv[2];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '')) {
  throw new Error('Usage: npm run release:version -- 0.7.0 (stable semantic version)');
}
for (const name of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
  const file = path.join(root, name);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  data.version = version;
  if (name === 'package-lock.json') data.packages[''].version = version;
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
for (const [name, pattern] of [
  ['src-tauri/Cargo.toml', /(^\[package\][\s\S]*?\nversion = ")[^"]+("\r?\n)/],
  ['src-tauri/Cargo.lock', /(^|\n)(name = "vrc-avatar-vault"\r?\nversion = ")[^"]+("\r?\n)/],
]) {
  const file = path.join(root, name);
  const content = readFileSync(file, 'utf8');
  if (!pattern.test(content)) throw new Error(`Version field not found in ${name}`);
  const replaced = name.endsWith('.lock')
    ? content.replace(
        pattern,
        (_m, prefix, field, suffix) => `${prefix}${field}${version}${suffix}`,
      )
    : content.replace(pattern, (_m, prefix, suffix) => `${prefix}${version}${suffix}`);
  writeFileSync(file, replaced, 'utf8');
}
console.log(`All application versions set to ${version}. Build and test before packaging.`);
