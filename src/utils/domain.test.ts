import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/avatar-pc-quest.json';
import {
  addVersionIncrement,
  versionedName,
  platforms,
  nativePerformance,
  performanceLabel,
  validateAvatarId,
  parseVRChatAvatar,
  compareAvatarSnapshots,
  nextSemanticVersion,
  validSemver,
  groupChangesByCategory,
  exportMarkdownChangelog,
  splitDiscord,
  compareOsc,
} from './domain';
import type { Change } from '../types/domain';
describe('VRChat normalization', () => {
  it('accepts UUID avatar identifiers and rejects paths', () => {
    expect(validateAvatarId(fixture.id)).toBe(true);
    for (const id of ['avtr_xxx', '../auth', 'usr_8c63ff8d-da1e-415a-912b-585ab866938f'])
      expect(validateAvatarId(id)).toBe(false);
  });
  it('requires identity and preserves unknown non-secret fields', () => {
    const a = parseVRChatAvatar({
      id: fixture.id,
      name: 'Test',
      future: { foo: 1, token: 'secret' },
      cookie: 'secret',
      styles: { primary: 'Furry' },
    });
    expect(a.unityPackages).toEqual([]);
    expect(a.future).toEqual({ foo: 1 });
    expect(a.cookie).toBeUndefined();
    expect(a.styles).toEqual({ primary: 'Furry' });
    expect(() => parseVRChatAvatar({ name: 'Broken' })).toThrow();
  });
  it('normalizes optional null fields', () => {
    const a = parseVRChatAvatar({ ...fixture, description: null, tags: null });
    expect(a.description).toBe('');
    expect(a.tags).toEqual([]);
  });
});
describe('snapshots', () => {
  const old = parseVRChatAvatar(fixture);
  it('ignores tag and package ordering and volatile timestamps', () => {
    const next = parseVRChatAvatar({
      ...old,
      updated_at: 'new',
      unityPackages: [...old.unityPackages].reverse().map((p) => ({ ...p, created_at: 'new' })),
    });
    expect(compareAvatarSnapshots(old, next).changed).toBe(false);
  });
  it('detects version, name, image, tags and package changes', () => {
    const next = parseVRChatAvatar({
      ...old,
      version: 69,
      name: 'Renamed',
      imageUrl: 'new',
      tags: ['different'],
      unityPackages: old.unityPackages.map((p) => ({
        ...p,
        assetVersion: p.assetVersion + 1,
        performanceRating: 'Excellent',
      })),
    });
    const diff = compareAvatarSnapshots(old, next);
    expect(diff.differences.map((d) => d.field)).toEqual(
      expect.arrayContaining(['version', 'name', 'imageUrl', 'tags']),
    );
    expect(diff.differences.filter((d) => d.field.startsWith('packages.'))).toHaveLength(2);
    expect(old.name).toBe(fixture.name);
  });
  it('detects package removal and Unity change', () => {
    expect(
      compareAvatarSnapshots(old, parseVRChatAvatar({ ...old, unityPackages: [] })).differences,
    ).toHaveLength(2);
    expect(
      compareAvatarSnapshots(
        old,
        parseVRChatAvatar({
          ...old,
          unityPackages: old.unityPackages.map((p) => ({ ...p, unityVersion: 'new' })),
        }),
      ).changed,
    ).toBe(true);
  });
});
describe('versioning and export', () => {
  const change: Change = {
    id: 'c',
    avatar_id: 'a',
    release_id: null,
    title: 'Eye tracking',
    description: 'Unified expressions',
    importance: 'Normal',
    platform: 'PC',
    categories: ['Added', 'Face Tracking'],
    created_at: '2026-09-29T12:00:00Z',
    updated_at: '2026-09-29T12:00:00Z',
  };
  it('increments semantic versions', () => {
    expect(nextSemanticVersion('4.6.2', 'patch')).toBe('4.6.3');
    expect(nextSemanticVersion('4.6.2', 'minor')).toBe('4.7.0');
    expect(nextSemanticVersion('4.6.2', 'major')).toBe('5.0.0');
    expect(validSemver('01.2.3')).toBe(false);
    expect(validSemver('1.2.3-01')).toBe(false);
    expect(validSemver('1.2.3-beta.1+build')).toBe(true);
  });
  it('groups entries into each selected category', () => {
    expect(Object.keys(groupChangesByCategory([change]))).toEqual(['Added', 'Face Tracking']);
  });
  it('exports readable Markdown', () => {
    const text = exportMarkdownChangelog('Kio', null, [change]);
    expect(text).toContain('# Kio — Unreleased');
    expect(text).toContain('## Added\n- Eye tracking\n  Unified expressions');
  });
  it('splits Discord messages without exceeding limit or breaking surrogate pairs', () => {
    const parts = splitDiscord('😀'.repeat(2300));
    expect(parts.every((p) => p.length <= 2000)).toBe(true);
    expect(parts.join('')).toBe('😀'.repeat(2300));
  });
});
it('compares OSC parameter additions, removals and type changes', () => {
  const differences = compareOsc(
    { parameters: [{ name: 'Old' }, { name: 'FT', input: { address: '/FT', type: 'Float' } }] },
    { parameters: [{ name: 'New' }, { name: 'FT', input: { address: '/FT', type: 'Bool' } }] },
  );
  expect(differences.map((d) => d.field)).toEqual(['Old', 'FT', 'New']);
});

describe('native platform compatibility and performance', () => {
  const avatar = parseVRChatAvatar({
    ...fixture,
    performance: {},
    unityPackages: [
      { platform: 'standalonewindows', variant: 'security', performanceRating: 'VeryPoor' },
      { platform: 'standalonewindows', variant: 'standard', performanceRating: 'None' },
      { platform: 'android', variant: 'impostor', performanceRating: 'Unknown' },
      { platform: 'ios', variant: 'impostor', performanceRating: 'Unknown' },
    ],
  });
  it('does not advertise impostors as native Quest or iOS support', () => {
    expect(platforms(avatar)).toEqual(['PC']);
    expect(avatar.unityPackages).toHaveLength(4);
    expect(
      platforms({
        ...avatar,
        unityPackages: [
          ...avatar.unityPackages,
          { ...avatar.unityPackages[0], platform: 'android', variant: 'standard' },
        ],
      }),
    ).toEqual(['PC', 'Quest']);
  });
  it('keeps VeryPoor instead of mixing None and impostor Unknown ratings', () => {
    expect(nativePerformance(avatar)).toEqual([
      { platform: 'PC', rating: 'VeryPoor', label: 'Very Poor' },
    ]);
    expect(performanceLabel('None')).toBe('Not rated');
    expect(performanceLabel('Unknown')).toBe('Unknown');
    expect(avatar.unityPackages[0].performanceRating).toBe('VeryPoor');
  });
  it('uses platform-level ratings when supplied and reports missing ratings honestly', () => {
    expect(
      nativePerformance({ ...avatar, performance: { standalonewindows: 'Good' } })[0].rating,
    ).toBe('Good');
    expect(
      nativePerformance({ ...avatar, unityPackages: [avatar.unityPackages[1]] })[0].rating,
    ).toBe('Unknown');
  });
});

it('replaces a trailing version without changing the base avatar name', () => {
  expect(versionedName("Kio's Rex", '1.1.3')).toBe("Kio's Rex v1.1.3");
  expect(versionedName("Kio's Rex v2027", '1.1.3')).toBe("Kio's Rex v1.1.3");
  expect(versionedName("Kio's Rex v1.1.2", '1.1.3')).toBe("Kio's Rex v1.1.3");
});

describe('Additive release versions', () => {
  it('adds repeated increments to the latest version', () => {
    const first = addVersionIncrement('1.0.0', '0.1.0');
    expect(first).toBe('1.1.0');
    expect(addVersionIncrement(first, '0.1.0')).toBe('1.2.0');
    expect(addVersionIncrement('1.4.9', '0.1.2')).toBe('1.5.11');
    expect(addVersionIncrement('1.4.9-beta.1+build', '1.0.0')).toBe('2.4.9');
  });
  it('rejects zero, negative, malformed and unsafe increments', () => {
    for (const input of ['0.0.0', '-1.0.0', '1.0', '0.01.0', '0.1.0-beta', '9007199254740992.0.0'])
      expect(() => addVersionIncrement('1.0.0', input)).toThrow();
    expect(() => addVersionIncrement('9007199254740991.0.0', '1.0.0')).toThrow();
  });
});
