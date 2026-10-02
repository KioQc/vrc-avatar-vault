import { AvatarBadges } from '../../components/AvatarBadges';
import { Modal } from '../../components/ui/dialog';
import { useState } from 'react';
import { useSettings } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
import { CopyButton } from '../../components/common';
import { technicalSchema, type StudioSnapshot } from '../../types/studio';
import {
  parameterCost,
  rulesFrom,
  structuredDiff,
  questChecks,
  significantChanges,
} from '../../utils/studio';
import type { Avatar } from '../../types/domain';
import { nativePerformance, nativePackages } from '../../utils/domain';
type Row = Record<string, unknown>;
const str = (v: unknown) =>
  v === null || v === undefined ? 'Unknown' : typeof v === 'object' ? JSON.stringify(v) : String(v);
function rows(v: unknown): Row[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Row[]) : [];
}
function Table({
  data,
  fields,
  onSelect,
}: {
  data: Row[];
  fields: string[];
  onSelect?: (row: Row) => void;
}) {
  const [sort, setSort] = useState<{ key: string; direction: number } | null>(null);
  const sorted = sort
    ? [...data].sort(
        (a, b) =>
          str(a[sort.key]).localeCompare(str(b[sort.key]), undefined, { numeric: true }) *
          sort.direction,
      )
    : data;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {fields.map((k) => (
              <th key={k}>
                <button
                  className="text-button"
                  onClick={() =>
                    setSort({ key: k, direction: sort?.key === k ? -sort.direction : 1 })
                  }
                >
                  {k} ↕
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={String(row.id ?? i)}
              tabIndex={onSelect ? 0 : undefined}
              onClick={() => onSelect?.(row)}
              onKeyDown={(e) => {
                if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect(row);
                }
              }}
            >
              {fields.map((k) => (
                <td className="break-all" key={k}>
                  {str(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function MenuTree({ menu, menus, visited = [] }: { menu: Row; menus: Row[]; visited?: string[] }) {
  const id = String(menu.id);
  if (visited.includes(id) || visited.length > 12)
    return <p className="tiny muted">{str(menu.name)} · linked menu</p>;
  return (
    <ul className="expression-tree">
      <li>
        <strong>{str(menu.name)}</strong>
        <ul>
          {rows(menu.controls).map((c, i) => {
            const sub = menus.find((m) => m.id === c.submenuId);
            return (
              <li key={i}>
                {str(c.name)} <span className="muted">{str(c.type)}</span>
                {sub && <MenuTree menu={sub} menus={menus} visited={[...visited, id]} />}
              </li>
            );
          })}
        </ul>
      </li>
    </ul>
  );
}
export function SnapshotInspector({
  snapshots,
  avatar,
  initialTab = 'Parameters',
}: {
  snapshots: StudioSnapshot[];
  avatar: Avatar;
  initialTab?: string;
}) {
  const [parameter, setParameter] = useState<Row | null>(null),
    [parameterFilter, setParameterFilter] = useState('All'),
    [diffFilter, setDiffFilter] = useState('All'),
    [menuMode, setMenuMode] = useState('Visual');
  const technical = snapshots.filter((s) => s.kind === 'technical');
  const [chosen, setChosen] = useState(''),
    [previous, setPrevious] = useState(''),
    [tab, setTab] = useState(initialTab),
    [search, setSearch] = useState(''),
    [menuId, setMenuId] = useState('');
  const { data: settings = {} } = useSettings();
  const rules = rulesFrom(settings.sdkRules);
  const current =
    technical.find((s) => s.id === chosen) ??
    technical.find((s) => s.source === 'unity_editor_plugin') ??
    technical[0];
  const parsed = current ? technicalSchema.safeParse(JSON.parse(current.data_json)) : null;
  const data = parsed?.success ? parsed.data : null;
  const old = technical.find((s) => s.id === previous);
  const differences = old && data ? structuredDiff(JSON.parse(old.data_json), data) : [];
  const parameters = data?.parameters ?? [];
  const costs = parameters.map((p) => parameterCost(p, rules));
  const cost = costs.some((x) => x === null)
    ? null
    : costs.reduce<number>((a, b) => a + (b ?? 0), 0);
  const menus = rows(data?.menus),
    menu = menus.find((m) => m.id === menuId) ?? menus[0];
  const controllers = rows(data?.controllers);
  const parameterNames = new Set(parameters.map((p) => p.name));
  const checks = data ? questChecks(data, rules) : [];
  const platforms = ['PC', 'Quest', 'iOS'];
  const platformData = Object.fromEntries(
    platforms.map((p) => {
      const s = technical.find((s) => s.platform === p);
      return [p, s ? technicalSchema.safeParse(JSON.parse(s.data_json)) : null];
    }),
  );
  const native = nativePerformance(avatar.data);
  const history = technical
    .filter((s) => s.platform === current?.platform)
    .slice(0, 20)
    .reverse()
    .map((s) => ({ s, data: technicalSchema.safeParse(JSON.parse(s.data_json)) }))
    .filter(
      (v): v is typeof v & { data: { success: true; data: NonNullable<typeof data> } } =>
        v.data.success,
    );
  return (
    <section className="panel">
      <h2>
        {tab === 'Performance'
          ? 'Performance'
          : tab === 'Parameters'
            ? 'Expression parameters'
            : tab === 'FX'
              ? 'Animator / FX'
              : 'Unity inspectors'}
      </h2>
      {['Performance', 'Platforms'].includes(tab) && (
        <div className="performance-summary">
          <AvatarBadges avatar={avatar} />
        </div>
      )}
      <p className="muted">
        Select a technical snapshot from Unity Bridge or import its JSON. Missing fields stay
        Unknown. Filesystem metadata cannot reconstruct Unity's full avatar state.
      </p>
      <div className="row wrap">
        <select
          aria-label="Technical snapshot"
          value={current?.id ?? ''}
          onChange={(e) => setChosen(e.target.value)}
        >
          <option value="">Choose a snapshot</option>
          {technical.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} · {s.platform} · {s.source}
            </option>
          ))}
        </select>
        {current && <CopyButton text={current.data_json} label="Copy snapshot JSON" />}
      </div>
      {current && (
        <p className="tiny muted">
          {current.created_at} · {current.source} · {current.platform} · schema{' '}
          {current.schema_version}
        </p>
      )}
      <div className="tabs">
        {[
          'Parameters',
          'Menus',
          'Hierarchy',
          'FX',
          'Descriptor',
          'Diff',
          'Performance',
          'Platforms',
          'Quest checks',
        ].map((t) => (
          <button className={tab === t ? 'active' : ''} key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {!data && tab !== 'Platforms' ? (
        <p className="notice">
          No valid technical snapshot available yet. Use the Unity Bridge or import a protocol v1
          snapshot.
        </p>
      ) : (
        <>
          {['Parameters', 'Menus', 'Hierarchy', 'FX'].includes(tab) && (
            <input
              placeholder="Search this inspector…"
              aria-label="Search inspector"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {tab === 'Parameters' && (
            <>
              <p>
                Network budget:{' '}
                <strong>
                  {data?.parameters
                    ? cost === null
                      ? 'Unknown'
                      : `${cost} / ${rules.parameterBudget} bits (${Math.round((cost / rules.parameterBudget) * 100)}%)`
                    : 'Unknown'}
                </strong>
              </p>
              {cost !== null && data?.parameters && (
                <progress max={rules.parameterBudget} value={cost} />
              )}
              {cost !== null && cost >= rules.parameterBudget * 0.7 && (
                <p className="notice">
                  {cost > rules.parameterBudget
                    ? 'Budget exceeded'
                    : cost >= rules.parameterBudget * 0.9
                      ? 'Near the configured limit'
                      : 'Review parameter budget'}
                </p>
              )}
              <div className="row">
                <select
                  aria-label="Parameter filter"
                  value={parameterFilter}
                  onChange={(e) => setParameterFilter(e.target.value)}
                >
                  {['All', 'Bool', 'Int', 'Float', 'Saved', 'Synced'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <span className="tiny muted">Select a parameter to inspect usage and history.</span>
              </div>
              <Table
                onSelect={setParameter}
                fields={['name', 'type', 'defaultValue', 'saved', 'synced', 'networkCost']}
                data={parameters
                  .filter(
                    (p) =>
                      String(p.name).toLowerCase().includes(search.toLowerCase()) &&
                      (parameterFilter === 'All' ||
                        (parameterFilter === 'Saved' && p.saved === true) ||
                        (parameterFilter === 'Synced' && p.synced === true) ||
                        p.type === parameterFilter),
                  )
                  .map((p) => ({ ...p, networkCost: parameterCost(p, rules) }))}
              />
              <p className="tiny muted">
                Rules {rules.version}. Configurable in Settings. Built-in animator parameters are
                separate from custom expression parameters.
              </p>
            </>
          )}
          {tab === 'Menus' && (
            <>
              <div className="row wrap">
                {menus
                  .filter((m) => String(m.name).toLowerCase().includes(search.toLowerCase()))
                  .map((m) => (
                    <Button key={String(m.id)} onClick={() => setMenuId(String(m.id))}>
                      {String(m.name)}
                    </Button>
                  ))}
              </div>
              <div className="row between">
                <h3>{str(menu?.name)}</h3>
                <div className="row">
                  {['Visual', 'Tree'].map((v) => (
                    <Button key={v} onClick={() => setMenuMode(v)}>
                      {v}
                    </Button>
                  ))}
                </div>
              </div>
              {menuMode === 'Tree' && menu ? (
                <MenuTree menu={menu} menus={menus} />
              ) : (
                <div className="menu-grid">
                  {rows(menu?.controls).map((c, i) => (
                    <button
                      className="stat-card"
                      key={i}
                      onClick={() => {
                        if (c.submenuId) setMenuId(String(c.submenuId));
                      }}
                    >
                      <strong>{str(c.name)}</strong>
                      <span>{str(c.type)}</span>
                      <span>
                        {str(c.parameter)} = {str(c.value)}
                      </span>
                      <span>{c.submenuId ? 'Open submenu' : str(c.subParameters)}</span>
                    </button>
                  ))}
                </div>
              )}
              <h3>Menu relationships</h3>
              <Table
                fields={['menu', 'control', 'type', 'target']}
                data={menus.flatMap((m) =>
                  rows(m.controls).map((c) => ({
                    menu: m.name,
                    control: c.name,
                    type: c.type,
                    target: c.submenuId ?? null,
                  })),
                )}
              />
            </>
          )}
          {tab === 'Hierarchy' && (
            <>
              {rows(data?.hierarchy)
                .filter((n) => str(n.path).toLowerCase().includes(search.toLowerCase()))
                .map((n) => (
                  <details key={String(n.id)}>
                    <summary>
                      {str(n.path)} · {rows(n.components).length} components
                    </summary>
                    <Table fields={['type', 'id', 'properties']} data={rows(n.components)} />
                  </details>
                ))}
            </>
          )}
          {tab === 'FX' && (
            <>
              {controllers
                .filter((c) => str(c.name).toLowerCase().includes(search.toLowerCase()))
                .map((c, i) => (
                  <details key={String(c.id ?? i)} open>
                    <summary>{str(c.name)}</summary>
                    <h4>Animator parameters</h4>
                    <Table
                      fields={['name', 'type', 'defaultValue', 'expressionMatch']}
                      data={rows(c.parameters).map((p) => ({
                        ...p,
                        expressionMatch: parameterNames.has(p.name)
                          ? parameters.find((x) => x.name === p.name)?.type === p.type
                            ? 'Matched'
                            : 'Type mismatch'
                          : 'No custom expression parameter (may be built-in)',
                      }))}
                    />
                    {rows(c.layers).map((l, j) => (
                      <details key={j}>
                        <summary>{str(l.name)}</summary>
                        <Table fields={['name', 'motion', 'transitions']} data={rows(l.states)} />
                        <p>Layer transitions: {str(l.transitions)}</p>
                      </details>
                    ))}
                  </details>
                ))}
            </>
          )}
          {tab === 'Descriptor' && (
            <dl className="definition-grid">
              {Object.entries(data?.descriptor ?? { status: 'Unknown' }).map(([k, v]) => (
                <div className="descriptor-property" key={k}>
                  <dt>{k}</dt>
                  <dd className="break-all">{str(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab === 'Diff' && (
            <>
              <label>
                Compare against
                <select value={previous} onChange={(e) => setPrevious(e.target.value)}>
                  <option value="">Choose older snapshot</option>
                  {technical
                    .filter((s) => s.id !== current?.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} · {s.platform}
                      </option>
                    ))}
                </select>
              </label>
              {old && (
                <>
                  <p>
                    {old.label} → {current?.label} · {differences.length} differences (up to 1,000)
                  </p>
                  <select
                    aria-label="Diff category"
                    value={diffFilter}
                    onChange={(e) => setDiffFilter(e.target.value)}
                  >
                    {[
                      'All',
                      'hierarchy',
                      'parameters',
                      'controllers',
                      'materials',
                      'descriptor',
                      'menus',
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <Table
                    fields={['kind', 'path', 'before', 'after']}
                    data={differences
                      .filter((d) => diffFilter === 'All' || d.path.startsWith('/' + diffFilter))
                      .map((d) => ({
                        ...d,
                        kind:
                          d.kind === 'Added'
                            ? '+ Added'
                            : d.kind === 'Removed'
                              ? '− Removed'
                              : '~ ' + d.kind,
                      }))}
                  />
                </>
              )}
            </>
          )}
          {tab === 'Performance' && (
            <>
              <p className="notice">
                Authored Unity snapshot metrics, before build-time optimizers. API ranks and local
                measurements are separate; changes are not necessarily regressions.
              </p>
              <div className="performance-grid">
                {Object.keys(data?.metrics ?? {}).map((k) => {
                  const points = history
                    .filter((h) => h.data.data.metrics?.[k] !== undefined)
                    .map((h) => ({ label: h.s.label, value: h.data.data.metrics![k] }));
                  const max = Math.max(1, ...points.map((p) => p.value));
                  return (
                    <div className="metric-history" key={k}>
                      <h4>
                        {k}: {data?.metrics?.[k]}
                      </h4>
                      {points.length > 1 && (
                        <svg viewBox="0 0 400 65" role="img" aria-label={`${k} history`}>
                          <polyline
                            fill="none"
                            stroke="var(--accent)"
                            strokeWidth="2"
                            points={points
                              .map(
                                (p, i) =>
                                  `${(i * 395) / Math.max(1, points.length - 1)},${60 - (p.value / max) * 55}`,
                              )
                              .join(' ')}
                          />
                        </svg>
                      )}
                      <p className="tiny muted">
                        {points.map((p) => `${p.label}: ${p.value}`).join(' → ')}
                      </p>
                    </div>
                  );
                })}
              </div>
              {history.length > 1 && (
                <>
                  <h3>Significant changes in latest two snapshots</h3>
                  <Table
                    fields={['metric', 'before', 'after', 'percent']}
                    data={significantChanges(
                      history.at(-2)?.data.data.metrics ?? {},
                      history.at(-1)?.data.data.metrics ?? {},
                      rules.regressionPercent,
                    ).map((v) => ({ ...v }))}
                  />
                </>
              )}
            </>
          )}
          {tab === 'Platforms' && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Information</th>
                    {platforms.map((p) => (
                      <th key={p}>{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    'Native package',
                    'API revision',
                    'Unity version',
                    'API performance',
                    'Snapshot',
                    'triangles',
                    'materials',
                    'meshes',
                    'physBones',
                    'contacts',
                    'textureMemoryBytes',
                  ].map((key) => (
                    <tr key={key}>
                      <th>{key}</th>
                      {platforms.map((p) => {
                        const apiPlatform = {
                          PC: 'standalonewindows',
                          Quest: 'android',
                          iOS: 'ios',
                        }[p];
                        const pack = nativePackages(avatar.data).find(
                          (x) => x.platform === apiPlatform,
                        );
                        const snap = platformData[p];
                        const local = snap?.success ? snap.data : null;
                        return (
                          <td key={p}>
                            {key === 'Native package'
                              ? pack
                                ? 'Available'
                                : 'Not reported'
                              : key === 'API revision'
                                ? pack
                                  ? avatar.data.version
                                  : 'Unknown'
                                : key === 'Unity version'
                                  ? (pack?.unityVersion ?? local?.unityVersion ?? 'Unknown')
                                  : key === 'API performance'
                                    ? (native.find((v) => v.platform === p)?.label ?? 'Unknown')
                                    : key === 'Snapshot'
                                      ? (technical.find((s) => s.platform === p)?.label ??
                                        'Unknown')
                                      : str(local?.metrics?.[key])}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'Quest checks' && (
            <>
              <p>
                Rules {rules.version}. Advisory checks on the selected snapshot; no automatic
                material changes.
              </p>
              {!data?.materials && <p>Shader compatibility: Unknown (no material data).</p>}
              {!data?.textures && <p>Texture sizes: Unknown.</p>}
              {checks.map((c, i) => (
                <div className="notice" key={i}>
                  <strong>
                    {c.severity} · {c.id}
                  </strong>
                  <p>{c.where}</p>
                  <p>{c.message}</p>
                </div>
              ))}
              {data?.materials && checks.length === 0 && (
                <p>
                  No issue detected by the available checks. This is not a complete SDK build
                  validation.
                </p>
              )}
            </>
          )}
        </>
      )}
      <Modal
        drawer
        open={!!parameter}
        onOpenChange={(v) => {
          if (!v) setParameter(null);
        }}
        title={str(parameter?.name)}
        description="Expression parameter · captured Unity data"
      >
        {parameter && (
          <>
            <dl className="definition-grid">
              {['type', 'defaultValue', 'saved', 'synced', 'networkCost'].map((k) => (
                <div className="descriptor-property" key={k}>
                  <dt>{k}</dt>
                  <dd>{str(parameter[k])}</dd>
                </div>
              ))}
            </dl>
            <h3>Animator usage</h3>
            {controllers
              .filter((c) => rows(c.parameters).some((p) => p.name === parameter.name))
              .map((c, i) => (
                <p key={i}>{str(c.name)}</p>
              ))}
            <h3>Menu usage</h3>
            {menus.flatMap((m) =>
              rows(m.controls)
                .filter(
                  (c) =>
                    c.parameter === parameter.name ||
                    rows(c.subParameters).some((p) => p.name === parameter.name),
                )
                .map((c, i) => (
                  <p key={String(m.id) + i}>
                    {str(m.name)} / {str(c.name)}
                  </p>
                )),
            )}
            <h3>Captured history</h3>
            <p className="tiny muted">
              Based on saved snapshots, not a complete asset edit history.
            </p>
            {technical
              .filter((t) => {
                const d = technicalSchema.safeParse(JSON.parse(t.data_json));
                return d.success && d.data.parameters?.some((p) => p.name === parameter.name);
              })
              .slice(0, 15)
              .map((t) => (
                <p key={t.id}>
                  {t.label} · {t.platform}
                  <small>{t.created_at}</small>
                </p>
              ))}
          </>
        )}
      </Modal>
    </section>
  );
}
