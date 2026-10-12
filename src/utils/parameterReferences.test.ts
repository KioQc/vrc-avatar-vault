import { it, expect } from 'vitest';
import { parameterReferences } from './parameterReferences';
it('finds duplicates and references including string subparameters without inventing built-in failures', () => {
  const result = parameterReferences(
    [{ name: 'Glasses' }, { name: 'Glasses' }],
    [
      {
        name: 'Face',
        controls: [
          { name: 'Eyes', parameter: 'Glasses', subParameters: ['LookX', { name: 'LookY' }] },
        ],
      },
    ],
    [{ name: 'FX', parameters: [{ name: 'Glasses' }, { name: 'IsLocal' }] }],
  );
  expect(result.duplicates).toEqual([{ name: 'Glasses', count: 2 }]);
  expect(result.unresolved.map((p) => p.name)).toEqual(['LookX', 'LookY']);
  expect(result.usages.Glasses.controllers).toEqual(['FX']);
  expect(result.unresolved.some((p) => p.name === 'IsLocal')).toBe(false);
});
