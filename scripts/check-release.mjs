import { readFileSync, existsSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const tag = process.argv[2];
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1];
if (
  tag !== `v${pkg.version}` ||
  !/^v\d+\.\d+\.\d+$/.test(tag) ||
  config.version !== pkg.version ||
  lock.version !== pkg.version ||
  cargo !== pkg.version
)
  throw new Error('Tag and application versions must match');
if (
  !config.plugins?.updater?.pubkey ||
  !config.plugins.updater.endpoints?.[0]?.startsWith('https://github.com/')
)
  throw new Error('Missing signed GitHub update configuration');
if (!existsSync(`docs/RELEASE-${pkg.version}.txt`)) throw new Error('Missing release notes');
console.log(`Release ${tag} configuration verified`);
