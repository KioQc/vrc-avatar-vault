import process from 'node:process';
import console from 'node:console';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { post } from './discord-post.mjs';

const repo = 'KioQc/vrc-avatar-vault';
try {
  const tag = process.argv.find((a) => /^v\d+\.\d+\.\d+$/.test(a));
  if (!tag) throw new Error('Supply a stable version tag, for example v0.8.1');
  const send = process.argv.includes('--send');
  const response = await globalThis.fetch(
    `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
    { signal: globalThis.AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const release = await response.json();
  if (
    release.draft ||
    release.prerelease ||
    release.tag_name !== tag ||
    !release.assets?.some((a) => a.name.endsWith('-setup.exe') || a.name.endsWith('-Setup.exe'))
  )
    throw new Error('Only published stable releases containing an installer can be announced');
  const url = `https://github.com/${repo}/releases/tag/${tag}`;
  const notes = String(release.body ?? 'Consulte les changements sur GitHub.');
  const content = `# 🚀 VAV ${tag} disponible\n\nTéléchargement officiel : ${url}\n\nDans VAV : Settings → GitHub automatic updates → Check GitHub now. Enregistre tes brouillons avant Install & restart. Une sauvegarde SQLite est créée avant installation.\n\nSupport et communauté : https://discord.gg/evvAZQzjPt`;
  const patch = `# 📝 VAV ${tag} — changements\n\n${notes.slice(0, 1450)}${notes.length > 1450 ? '\n… Notes complètes sur GitHub.' : ''}\n\n${url}`;
  if (!send) console.log(JSON.stringify({ releases: content, 'patch-notes': patch }, null, 2));
  else {
    const hooks = process.env.VAV_DISCORD_WEBHOOKS_FILE
      ? JSON.parse(readFileSync(process.env.VAV_DISCORD_WEBHOOKS_FILE, 'utf8'))
      : {
          releases: process.env.DISCORD_RELEASES_WEBHOOK,
          'patch-notes': process.env.DISCORD_PATCH_NOTES_WEBHOOK,
        };
    const state = resolve(process.env.VAV_DISCORD_STATE_DIR || '.discord-delivery');
    mkdirSync(state, { recursive: true });
    // Also save the rendered text to make an uncertain delivery reviewable without exposing secrets.
    for (const [channel, text] of [
      ['releases', content],
      ['patch-notes', patch],
    ]) {
      writeFileSync(resolve(state, `${channel}-${tag}.md`), text);
      console.log(
        channel,
        await post({
          webhook: hooks[channel],
          content: text,
          receipt: resolve(state, `${channel}-${tag}.json`),
          send: true,
        }),
      );
    }
  }
} catch (error) {
  // Never print network exception URLs: a webhook URL is a credential.
  console.error(error instanceof TypeError ? 'Network request failed' : error.message);
  process.exitCode = 1;
}
