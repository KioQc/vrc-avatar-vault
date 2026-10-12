import { it, expect } from 'vitest';
import { combinedExpressionMenus } from './expressionMenus';
it('includes descriptor and Fury roots while separating reused asset identifiers by source', () => {
  const menus = combinedExpressionMenus(
    [{ id: 'root', name: 'Avatar', controls: [] }],
    [
      {
        id: 'root',
        name: 'Clothes',
        sourceObject: 'Avatar/Jacket',
        controls: [{ name: 'More', submenuId: 'child' }],
      },
      { id: 'child', name: 'Options', sourceObject: 'Avatar/Jacket', controls: [] },
    ],
  );
  expect(menus[0].controls as unknown[]).toHaveLength(2);
  expect(new Set(menus.map((m) => m.id)).size).toBe(4);
  expect((menus[2].controls as Array<{ submenuId: string }>)[0].submenuId).toBe(menus[3].id);
  expect(menus[1].origin).toBe('Descriptor');
});
