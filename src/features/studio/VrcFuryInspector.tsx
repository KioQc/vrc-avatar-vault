import { useState } from 'react';
import type { TechnicalData } from '../../types/studio';
import { Button } from '../../components/ui/button';
import { CopyButton } from '../../components/common';
import { InspectorTree } from '../../components/InspectorTree';
type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((v): v is Row => !!v && typeof v === 'object') : [];
const text = (value: unknown) => (value == null ? 'Unknown' : String(value));
function FuryMenu({ menu, menus, visited = [] }: { menu: Row; menus: Row[]; visited?: unknown[] }) {
  if (visited.includes(menu.id) || visited.length > 32)
    return <p className="tiny muted">{text(menu.name)} · linked menu</p>;
  return (
    <details className="inspector-tree-node">
      <summary>
        {text(menu.name)} · {rows(menu.controls).length} controls
      </summary>
      <div className="inspector-tree-children">
        <p className="tiny muted break-all">{text(menu.assetPath)}</p>
        {rows(menu.controls).map((c, i) => {
          const sub = menus.find(
            (m) => m.id === c.submenuId && m.sourceObject === menu.sourceObject,
          );
          return (
            <div key={i}>
              <strong>{text(c.name)}</strong> <span className="muted">{text(c.type)}</span>
              {sub ? (
                <FuryMenu menu={sub} menus={menus} visited={[...visited, menu.id]} />
              ) : (
                <p className="tiny muted">
                  {text(c.parameter)} = {text(c.value)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
export function VrcFuryInspector({ data }: { data: TechnicalData | null }) {
  const [search, setSearch] = useState('');
  const fury = data?.vrcfury as Record<string, unknown> | undefined;
  const components = rows(fury?.components),
    parameters = rows(fury?.parameters),
    menus = rows(fury?.menus);
  const matches = (value: unknown) =>
    JSON.stringify(value).toLowerCase().includes(search.toLowerCase());
  const matchingSources = new Set(menus.filter(matches).map((m) => m.sourceObject));
  const roots = menus.filter(
    (m) =>
      !menus.some(
        (parent) =>
          parent.sourceObject === m.sourceObject &&
          rows(parent.controls).some((c) => !!c.submenuId && c.submenuId === m.id),
      ),
  );
  const menuRoots = roots.length
    ? roots
    : menus.filter((m, i) => i === menus.findIndex((v) => v.sourceObject === m.sourceObject));
  return (
    <section className="panel">
      <div className="row between wrap">
        <h3>VRCFury · Menus & parameters</h3>
        {fury && <CopyButton text={JSON.stringify(fury, null, 2)} label="Copy VRCFury JSON" />}
      </div>
      <p className="notice">
        These are authored VRCFury inputs, separate from the avatar descriptor. VRCFury can merge,
        rename or generate parameters during build. They are not added to the descriptor budget or
        presented as final uploaded output.
      </p>
      {!fury ? (
        <p>Capture a new snapshot with Unity Bridge 0.1.1 to inspect VRCFury.</p>
      ) : (
        <>
          <p className="muted">
            {components.length} components · {parameters.length} referenced parameters ·{' '}
            {menus.length} referenced menus
          </p>
          <input
            aria-label="Search VRCFury"
            placeholder="Search menu, parameter or source object…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <h4>Referenced expression parameters</h4>
          {!parameters.length && (
            <p className="muted">
              No referenced parameter asset found. Toggle declarations below may still generate
              parameters at build.
            </p>
          )}
          <InspectorTree
            searching={!!search.trim()}
            entries={parameters.filter(matches).map((p, i) => ({
              id: String(i),
              path: `${text(p.sourceObject)}/${text(p.name)}`,
              label: text(p.type),
              content: (
                <dl className="definition-grid">
                  {['type', 'defaultValue', 'saved', 'synced', 'assetPath'].map((k) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd className="break-all">{text(p[k])}</dd>
                    </div>
                  ))}
                </dl>
              ),
            }))}
          />
          <details className="inspector-component">
            <summary>All parameter values · table</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {['Name', 'Type', 'Default', 'Saved', 'Synced', 'Source'].map((v) => (
                      <th key={v}>{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parameters.filter(matches).map((p, i) => (
                    <tr key={i}>
                      <td>{text(p.name)}</td>
                      <td>{text(p.type)}</td>
                      <td>{text(p.defaultValue)}</td>
                      <td>{text(p.saved)}</td>
                      <td>{text(p.synced)}</td>
                      <td className="break-all">
                        {text(p.sourceObject)}
                        <small className="muted"> · {text(p.assetPath)}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <h4>Referenced menus</h4>
          {!menus.length && <p className="muted">No referenced menu asset found.</p>}
          <InspectorTree
            searching={!!search.trim()}
            entries={menuRoots
              .filter((m) => !search.trim() || matchingSources.has(m.sourceObject))
              .map((m, i) => ({
                id: `${text(m.id)}:${i}`,
                path: text(m.sourceObject),
                content: <FuryMenu menu={m} menus={menus} />,
              }))}
          />
          <h4>Components & generated toggle declarations</h4>
          <InspectorTree
            searching={!!search.trim()}
            entries={components.filter(matches).map((c, i) => ({
              id: String(c.id ?? i),
              path: text(c.path),
              label:
                c.activeInHierarchy === false
                  ? 'Inactive object'
                  : c.enabled === false
                    ? 'Disabled'
                    : 'Enabled',
              content: (
                <>
                  {rows(c.declarations).map((d, j) => (
                    <div className="feed-line" key={j}>
                      <strong>{text(d.menuPath)}</strong>
                      <span>{d.slider ? 'Slider' : 'Toggle'}</span>
                      <span>Saved: {text(d.saved)}</span>
                      <span>
                        Global parameter:{' '}
                        {d.useGlobalParam ? text(d.globalParam) : 'Generated at build'}
                      </span>
                    </div>
                  ))}
                  <details className="inspector-component">
                    <summary>Technical details / JSON</summary>
                    <pre className="json-view">{JSON.stringify(c, null, 2)}</pre>
                  </details>
                </>
              ),
            }))}
          />
          {Array.isArray(fury?.warnings) &&
            fury.warnings.map((w, i) => (
              <p className="notice" key={i}>
                {text(w)}
              </p>
            ))}
          <div className="row wrap">
            <Button onClick={() => setSearch('')}>Reset search</Button>
          </div>
        </>
      )}
    </section>
  );
}
