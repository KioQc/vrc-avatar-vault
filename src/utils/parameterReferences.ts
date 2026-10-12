type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] =>
  Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === 'object') : [];
export function parameterReferences(parameters: unknown, menus: unknown, controllers: unknown) {
  const known = new Set(rows(parameters).map((p) => p.name));
  const counts = new Map<string, number>();
  for (const p of rows(parameters)) {
    if (typeof p.name === 'string' && p.name) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  }
  const usages: Record<string, { menus: string[]; controllers: string[] }> = {};
  const add = (name: unknown, kind: 'menus' | 'controllers', source: string) => {
    if (typeof name !== 'string' || !name) return;
    const entry = usages[name] ?? { menus: [], controllers: [] };
    entry[kind].push(source);
    usages[name] = entry;
  };
  for (const m of rows(menus))
    for (const c of rows(m.controls)) {
      add(c.parameter, 'menus', `${String(m.name)}/${String(c.name)}`);
      if (Array.isArray(c.subParameters))
        for (const p of c.subParameters)
          add(
            typeof p === 'string' ? p : (p as Row)?.name,
            'menus',
            `${String(m.name)}/${String(c.name)}`,
          );
    }
  for (const c of rows(controllers))
    for (const p of rows(c.parameters)) add(p.name, 'controllers', String(c.name));
  return {
    usages,
    duplicates: [...counts].filter(([, n]) => n > 1).map(([name, count]) => ({ name, count })),
    unresolved: Object.entries(usages)
      .filter(([name, value]) => !known.has(name) && value.menus.length)
      .map(([name, value]) => ({ name, ...value })),
  };
}
