import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VrcFuryInspector } from './VrcFuryInspector';
import { technicalSchema } from '../../types/studio';
it('keeps authored VRCFury inputs and source paths visible without declaring generated output', () => {
  const data = technicalSchema.parse({
    schemaVersion: 1,
    source: 'unity_editor_plugin',
    platform: 'PC',
    parameters: [],
    vrcfury: {
      components: [
        {
          path: 'Avatar/Outfit',
          enabled: true,
          declarations: [
            { menuPath: 'Clothes/Jacket', slider: false, saved: true, useGlobalParam: false },
          ],
        },
      ],
      parameters: [
        {
          name: 'OutfitEnabled',
          type: 'Bool',
          defaultValue: 0,
          saved: true,
          synced: true,
          sourceObject: 'Avatar/Outfit',
          assetPath: 'Assets/OutfitParams.asset',
        },
      ],
      menus: [
        {
          id: 'a',
          name: 'Outfit menu',
          controls: [{ name: 'Jacket', type: 'Toggle', parameter: 'OutfitEnabled', value: 1 }],
          sourceObject: 'Avatar/Outfit',
          assetPath: 'Assets/OutfitMenu.asset',
        },
      ],
      warnings: ['Inspection limited'],
      generatedOutputCaptured: false,
    },
  });
  const html = renderToStaticMarkup(<VrcFuryInspector data={data} />);
  for (const text of [
    'OutfitEnabled',
    'Outfit menu',
    'Jacket',
    'Avatar/Outfit',
    'Assets/OutfitParams.asset',
    'Generated at build',
    'Inspection limited',
  ])
    expect(html).toContain(text);
  expect(data.parameters).toEqual([]);
});
