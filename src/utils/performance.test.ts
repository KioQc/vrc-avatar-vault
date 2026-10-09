import { expect, it } from 'vitest';
import { analysisReference, metricRank, metricValue } from './performance';
import { packageSchema } from '../types/domain';
it('keeps platform-specific boundaries and missing values distinct', () => {
  expect(metricRank('standalonewindows', 'totalPolygons', 70000)).toBe('Good');
  expect(metricRank('android', 'totalPolygons', 70000)).toBe('VeryPoor');
  expect(metricRank('ios', 'totalPolygons', 20000)).toBe('Poor');
  expect(metricRank('android', 'totalPolygons', null)).toBeNull();
  expect(metricRank('standalonewindows', 'bounds', [3, 13, 2])).toBe('VeryPoor');
  expect(metricRank('android', 'lightCount', 0)).toBeNull();
  expect(metricValue(null)).toBe('—');
  expect(metricValue(0)).toBe('0');
  expect(metricValue('42')).toBe('—');
});
it('accepts only native VRChat file references without arbitrary URLs', () => {
  const pkg = (assetUrl: string) => packageSchema.parse({ assetUrl, variant: 'security' });
  expect(
    analysisReference(
      pkg(
        'https://api.vrchat.cloud/api/1/file/file_00000000-0000-4000-8000-000000000001/22/variant/security',
      ),
    ),
  ).toEqual({ id: 'file_00000000-0000-4000-8000-000000000001', version: 22, variant: 'security' });
  expect(
    analysisReference(
      pkg('https://evil.example/api/1/file/file_00000000-0000-4000-8000-000000000001/22/file'),
    ),
  ).toBeNull();
});
