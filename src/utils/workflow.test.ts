import { expect, it } from 'vitest';
import { dependencyDiff, filterFiles, fileFolder, compareFileTrees } from './workflow';
it('finds renamed files by previous path and combines filters without hiding unrelated folders', () => {
  const changes = [
    {
      type: 'Renamed',
      path: 'Assets/FX/New.controller',
      oldPath: 'Assets/Old.controller',
      kind: 'controller',
    },
    { type: 'Created', path: 'Assets/Textures/body.png', kind: 'png' },
    { type: 'Deleted', path: 'Assets/Materials/body.mat', kind: 'mat' },
  ];
  expect(filterFiles(changes, 'Old.controller', 'Renamed', 'controller', 'All')).toHaveLength(1);
  expect(filterFiles(changes, '', 'Added', 'All', 'Assets/Textures')).toHaveLength(1);
  expect(filterFiles(changes, '', 'Removed', 'png', 'All')).toEqual([]);
  expect(fileFolder('Assets\\FX\\New.controller')).toBe('Assets/FX');
});
it('shows a unique rename once and avoids timestamp-only changes with matching hashes', () => {
  const old = {
    'Assets/a.mat': { hash: 'a', size: 10, kind: 'mat' },
    'Assets/fx.controller': { hash: 'fx', size: 20, kind: 'controller' },
  };
  const next = {
    'Assets/b.mat': { hash: 'a', size: 10, kind: 'mat' },
    'Assets/fx.controller': { hash: 'fx', size: 20, kind: 'controller' },
  };
  expect(compareFileTrees(old, next)).toEqual([
    { type: 'Renamed', path: 'Assets/b.mat', oldPath: 'Assets/a.mat', kind: 'mat' },
  ]);
});
it('compares versions and origins by package name, independent of ordering', () => {
  const pkg = (name: string, version: string, type = 'VPM') => ({
    name,
    version,
    type,
    source: 'manifest.json',
  });
  const before = [
    pkg('sdk', '1'),
    pkg('removed', '1'),
    pkg('same', '1'),
    pkg('origin', '1', 'Git'),
  ];
  const after = [pkg('same', '1'), pkg('sdk', '2'), pkg('new', '1'), pkg('origin', '1', 'Local')];
  expect(dependencyDiff(before, after).map((p) => [p.name, p.type])).toEqual([
    ['new', 'Added'],
    ['origin', 'Changed'],
    ['removed', 'Removed'],
    ['sdk', 'Changed'],
  ]);
});
it('does not infer renames from duplicate hashes and scales to many removed files', () => {
  const duplicate = { hash: 'same', size: 10, kind: 'mat' };
  expect(
    compareFileTrees(
      { 'Assets/a.mat': duplicate, 'Assets/b.mat': duplicate },
      { 'Assets/c.mat': duplicate },
    ).map((c) => c.type),
  ).toEqual(['Deleted', 'Deleted', 'Created']);
  const old = Object.fromEntries(
    Array.from({ length: 12000 }, (_, i) => [
      `Assets/${i}.mat`,
      { hash: String(i), size: 10, kind: 'mat' },
    ]),
  );
  expect(compareFileTrees(old, {})).toHaveLength(12000);
});
