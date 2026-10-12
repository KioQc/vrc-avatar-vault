import type { ReactNode } from 'react';
import { Folder, FileCode2 } from 'lucide-react';
export interface InspectorEntry {
  id: string;
  path: string;
  content: ReactNode;
  label?: string;
}
interface Branch {
  name: string;
  path: string;
  children: Map<string, Branch>;
  entries: InspectorEntry[];
  count: number;
}
export function inspectorBranches(entries: InspectorEntry[]) {
  const root: Branch = { name: '', path: '', children: new Map(), entries: [], count: 0 };
  for (const entry of entries) {
    let node = root;
    const parts = entry.path.replace(/\\/g, '/').split('/').filter(Boolean);
    for (const name of parts) {
      node.count++;
      const path = node.path ? `${node.path}/${name}` : name;
      let next = node.children.get(name);
      if (!next) {
        next = { name, path, children: new Map(), entries: [], count: 0 };
        node.children.set(name, next);
      }
      node = next;
    }
    node.count++;
    node.entries.push(entry);
  }
  return [...root.children.values()];
}
export function InspectorTree({
  entries,
  searching = false,
}: {
  entries: InspectorEntry[];
  searching?: boolean;
}) {
  function render(branch: Branch, depth = 0): ReactNode {
    if (depth > 64)
      return (
        <p className="notice" key={branch.path}>
          Depth limit reached · {branch.path}
        </p>
      );
    return (
      <details
        key={`${branch.path}:${searching}`}
        className="inspector-tree-node"
        open={searching || (depth === 0 && branch.children.size > 0)}
      >
        <summary title={branch.path}>
          {branch.children.size ? <Folder size={15} /> : <FileCode2 size={15} />}
          <span className="inspector-tree-name">{branch.name}</span>
          <small className="muted">
            {branch.children.size
              ? `${branch.count} items`
              : branch.entries
                  .map((e) => e.label)
                  .filter(Boolean)
                  .join(' · ')}
          </small>
        </summary>
        <div className="inspector-tree-children">
          {branch.entries.map((entry) => (
            <div key={entry.id} className="inspector-tree-content">
              <p className="tiny muted break-all">{entry.path}</p>
              {entry.content}
            </div>
          ))}
          {[...branch.children.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => render(child, depth + 1))}
        </div>
      </details>
    );
  }
  return (
    <div className="inspector-tree">
      {inspectorBranches(entries).map((branch) => render(branch))}
      {!entries.length && <p className="muted">No matching entries.</p>}
    </div>
  );
}
