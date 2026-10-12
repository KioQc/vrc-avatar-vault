type Menu = Record<string, unknown>;
const rows = (v: unknown): Menu[] =>
  Array.isArray(v) ? v.filter((x): x is Menu => !!x && typeof x === 'object') : [];
export function combinedExpressionMenus(descriptor: unknown, fury: unknown): Menu[] {
  const groups = new Map<string, Menu[]>();
  groups.set('Descriptor', rows(descriptor));
  for (const menu of rows(fury)) {
    const source = `VRCFury · ${String(menu.sourceObject ?? 'Unknown object')}`;
    groups.set(source, [...(groups.get(source) ?? []), menu]);
  }
  const result: Menu[] = [],
    roots: Menu[] = [];
  for (const [source, menus] of groups) {
    const id = (v: unknown) => JSON.stringify([source, v]);
    const mapped = menus.map((m, i) => ({
      ...m,
      id: id(m.id ?? i),
      origin: source,
      name: `${String(m.name ?? 'Menu')} · ${source}`,
      controls: rows(m.controls).map((c) => ({
        ...c,
        submenuId: c.submenuId == null ? null : id(c.submenuId),
      })),
    }));
    result.push(...mapped);
    const incoming = new Set(
      mapped.flatMap((m) => m.controls.map((c) => c.submenuId).filter(Boolean)),
    );
    const top = mapped.filter((m) => !incoming.has(m.id));
    for (const menu of top.length ? top : mapped.slice(0, 1))
      roots.push({ name: menu.name, type: 'SubMenu', submenuId: menu.id });
  }
  return result.length
    ? [{ id: 'vav:all-menu-sources', name: 'All menu sources', controls: roots }, ...result]
    : [];
}
