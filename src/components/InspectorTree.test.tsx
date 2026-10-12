import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InspectorTree, inspectorBranches } from './InspectorTree';
it('nests children under a shared parent and preserves a second branch with the same leaf name', () => {
  const entries = [
    'Avatar/Armature',
    'Avatar/Armature/Hips',
    'Avatar/Armature/Hips/Leg',
    'Avatar/Outfit/Leg',
  ].map((path, i) => ({ id: String(i), path, content: 'Details' }));
  const [root] = inspectorBranches(entries);
  expect(root.children.size).toBe(2);
  expect(root.children.get('Armature')?.children.get('Hips')?.children.has('Leg')).toBe(true);
  expect(root.children.get('Outfit')?.children.has('Leg')).toBe(true);
  const html = renderToStaticMarkup(<InspectorTree entries={entries} />);
  expect(html.match(/class="inspector-tree-name">Armature/g)).toHaveLength(1);
  expect(html).toContain('title="Avatar/Armature/Hips/Leg"');
  expect(html).not.toContain('inspector-tree-name">Avatar/Armature');
});
it('keeps ancestors in search results and expands matching paths', () => {
  const html = renderToStaticMarkup(
    <InspectorTree
      searching
      entries={[{ id: 'x', path: 'Avatar/Clothing/Jacket', content: 'Saved parameter' }]}
    />,
  );
  expect(html.match(/open=""/g)).toHaveLength(3);
  expect(html).toContain('inspector-tree-name">Clothing');
});
