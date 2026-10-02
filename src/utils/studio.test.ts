import { expect, it } from 'vitest';
import {
  parameterCost,
  structuredDiff,
  significantChanges,
  rulesFrom,
  questChecks,
} from './studio';
it('keeps unknown parameter costs unknown and excludes unsynced values', () => {
  expect(parameterCost({ type: 'Bool', synced: true })).toBe(1);
  expect(parameterCost({ type: 'Int', synced: true })).toBe(8);
  expect(parameterCost({ type: 'Float', synced: false })).toBe(0);
  expect(parameterCost({ type: 'Bool' })).toBeNull();
});
it('matches stable identities and reports moved objects', () => {
  const a = [
    { id: 'a', parentId: 'root' },
    { id: 'b', parentId: 'root' },
  ];
  expect(structuredDiff(a, [a[1], a[0]])).toEqual([]);
  expect(structuredDiff(a, [{ id: 'a', parentId: 'b' }, a[1]])[0].kind).toBe('Moved');
});
it('does not lose duplicate named array items', () => {
  expect(
    structuredDiff(
      [
        { name: 'x', value: 1 },
        { name: 'x', value: 2 },
      ],
      [
        { name: 'x', value: 3 },
        { name: 'x', value: 2 },
      ],
    ),
  ).toHaveLength(1);
});
it('reports zero-baseline increases without infinite percentages', () => {
  expect(significantChanges({ triangles: 0 }, { triangles: 30 })[0].percent).toBeNull();
  expect(significantChanges({ triangles: 100 }, { triangles: 110 })).toEqual([]);
});
it('bounds configurable rules and does not infer missing platform metrics', () => {
  expect(rulesFrom('{"parameterBudget":-2}').parameterBudget).toBe(256);
  expect(questChecks({ schemaVersion: 1, source: 'unity_editor_plugin', platform: 'PC' })).toEqual(
    [],
  );
});
