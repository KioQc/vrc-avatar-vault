import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { desktop } from '../../db/bridge';
import { RefreshCw, FolderOpen } from 'lucide-react';
import { repository } from '../../db/repository';
import { useAction } from '../../hooks/useVault';
import { useUI } from '../../stores/ui';
import { oscSchema, type Avatar, type Difference } from '../../types/domain';
import { compareOsc } from '../../utils/domain';
import { openFolder, readText } from '../../services/files';
import { Button } from '../../components/ui/button';
import { Badge, CopyButton, Empty, dateText } from '../../components/common';
import { DiffDialog } from '../snapshots/DiffDialog';
export function OscPanel({ avatar }: { avatar: Avatar }) {
  const user = useUI((s) => s.user);
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all'),
    [kind, setKind] = useState('all'),
    [selected, setSelected] = useState(''),
    [sourceMode, setSourceMode] = useState<'local' | 'snapshot'>('local');
  const [captureError, setCaptureError] = useState('');
  const captured = useRef('');
  const local = useQuery({
    queryKey: ['osc-local', avatar.vrchat_id, user?.id],
    queryFn: async () => {
      const raw = await invoke('read_osc', { user: user?.id ?? '', avatar: avatar.vrchat_id });
      if (!raw) return null;
      const parsed = oscSchema.parse(raw);
      if (parsed.id && parsed.id !== avatar.vrchat_id)
        throw new Error('OSC file belongs to a different avatar');
      return parsed;
    },
    enabled: desktop && !!avatar.vrchat_id && sourceMode === 'local',
    refetchInterval: 30000,
    retry: false,
  });
  const [diff, setDiff] = useState<Difference[] | null>(null),
    [missing, setMissing] = useState(false);
  const { data: snapshots = [], isSuccess: snapshotsReady } = useQuery({
    queryKey: ['osc', avatar.id],
    queryFn: () => repository.oscSnapshots(avatar.id),
  });
  const latest = snapshots[0] ? oscSchema.parse(JSON.parse(snapshots[0].data_json)) : null;
  const shown = sourceMode === 'snapshot' ? latest : (local.data ?? latest);
  const parameter = shown?.parameters.find((p) => p.name === selected);
  const filtered =
    shown?.parameters.filter(
      (p) =>
        JSON.stringify(p).toLowerCase().includes(search.toLowerCase()) &&
        (direction === 'all' ||
          (direction === 'input'
            ? !!p.input
            : direction === 'output'
              ? !!p.output
              : !!p.input && !!p.output)) &&
        (kind === 'all' || p.input?.type === kind || p.output?.type === kind),
    ) ?? [];
  useEffect(() => {
    if (!local.data || !snapshotsReady || sourceMode !== 'local') return;
    const signature = avatar.id + JSON.stringify(local.data);
    if (captured.current === signature) return;
    captured.current = signature;
    const previous = snapshots[0] ? oscSchema.parse(JSON.parse(snapshots[0].data_json)) : null;
    if (previous && !compareOsc(previous, local.data).length) return;
    void repository
      .saveOsc(avatar.id, local.data)
      .then(() => {
        setCaptureError('');
        return client.invalidateQueries({ queryKey: ['osc', avatar.id] });
      })
      .catch((e) => {
        captured.current = '';
        setCaptureError(String(e));
      });
  }, [local.data, snapshotsReady, snapshots, avatar.id, client, sourceMode]);
  const refresh = useAction(async (importFile: boolean) => {
    let raw: unknown;
    if (importFile) {
      const text = await readText();
      if (!text) return;
      raw = JSON.parse(text.replace(/^\uFEFF/, ''));
    } else raw = await invoke('read_osc', { user: user?.id ?? '', avatar: avatar.vrchat_id ?? '' });
    if (!raw) {
      setMissing(true);
      return;
    }
    setMissing(false);
    const data = oscSchema.parse(raw);
    if (data.id && avatar.vrchat_id && data.id !== avatar.vrchat_id)
      throw new Error('OSC file belongs to a different avatar');
    const differences = latest
      ? compareOsc(latest, data)
      : data.parameters.map((p) => ({ field: p.name, oldValue: null, newValue: p }));
    if (!latest || differences.length) await repository.saveOsc(avatar.id, data);
    setSourceMode(importFile ? 'snapshot' : 'local');
    if (!importFile) await local.refetch();
    setDiff(differences);
  });
  const folder = useAction(() => openFolder('osc', user?.id));
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>OSC parameter explorer</h2>
          <p>
            {sourceMode === 'local'
              ? 'Local VRChat configuration · automatically checked every 30 seconds.'
              : 'Imported snapshot · Refresh OSC data to resume local file checks.'}
          </p>
        </div>
        <div className="row wrap">
          <Link className="button secondary" to="/vrchat?tab=OSC%20live">
            Open live inspector
          </Link>
          <Button onClick={() => folder.mutate()}>
            <FolderOpen size={14} />
            Open OSC folder
          </Button>
          <Button onClick={() => refresh.mutate(true)}>Import JSON</Button>
          <Button disabled={refresh.isPending} onClick={() => refresh.mutate(false)}>
            <RefreshCw size={14} />
            Refresh OSC data
          </Button>
        </div>
      </div>
      {((sourceMode === 'local' && local.error) || captureError) && (
        <p role="alert" className="error-notice">
          {String(local.error ?? captureError)}
        </p>
      )}
      {sourceMode === 'local' && (missing || local.data === null) && (
        <p className="notice">
          Enable OSC in VRChat's Action Menu, then wear this published avatar. VRChat generates the
          configuration on this computer. You can also import its JSON file.
        </p>
      )}
      {shown ? (
        <>
          <p className="tiny muted">
            {sourceMode === 'local' && local.data
              ? 'Local file detected'
              : 'Saved / imported snapshot'}{' '}
            · {dateText(snapshots[0]?.created_at ?? null)} · {shown.parameters.length} parameters
          </p>
          <div className="stats-grid osc-summary">
            <div className="stat-card">
              <span>Parameters</span>
              <strong>{shown.parameters.length}</strong>
            </div>
            <div className="stat-card">
              <span>Input to VRChat</span>
              <strong>{shown.parameters.filter((p) => p.input).length}</strong>
            </div>
            <div className="stat-card">
              <span>Output from VRChat</span>
              <strong>{shown.parameters.filter((p) => p.output).length}</strong>
            </div>
            <div className="stat-card">
              <span>Both directions</span>
              <strong>{shown.parameters.filter((p) => p.input && p.output).length}</strong>
            </div>
          </div>
          <div className="row wrap">
            <select
              aria-label="OSC direction filter"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="all">All directions</option>
              <option value="input">Input to game</option>
              <option value="output">Output from game</option>
              <option value="both">Both directions</option>
            </select>
            <select
              aria-label="OSC configuration type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">All types</option>
              {['Bool', 'Int', 'Float'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <Badge>{filtered.length} shown</Badge>
            <CopyButton text={JSON.stringify(shown, null, 2)} label="Copy configuration JSON" />
          </div>
          <input
            aria-label="Search OSC parameters"
            placeholder="Search parameter, address or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="osc-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Input address</th>
                  <th>Type</th>
                  <th>Output address</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={`${p.name}-${i}`}>
                    <td>
                      <button className="parameter-link" onClick={() => setSelected(p.name)}>
                        {p.name}
                      </button>
                    </td>
                    <td>{p.input?.address ?? '—'}</td>
                    <td>{p.input?.type ?? '—'}</td>
                    <td>{p.output?.address ?? '—'}</td>
                    <td>{p.output?.type ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parameter && (
            <section className="panel parameter-inspection">
              <div className="section-heading">
                <h3>{parameter.name}</h3>
                <Button size="sm" onClick={() => setSelected('')}>
                  Close details
                </Button>
              </div>
              <div className="inspector-columns">
                <div>
                  <h4>Input · receives in VRChat</h4>
                  <p className="break-all">{parameter.input?.address ?? 'No input mapping'}</p>
                  <Badge>{parameter.input?.type ?? 'Not configured'}</Badge>
                  {parameter.input && (
                    <CopyButton text={parameter.input.address} label="Copy input" />
                  )}
                </div>
                <div>
                  <h4>Output · sent from VRChat</h4>
                  <p className="break-all">{parameter.output?.address ?? 'No output mapping'}</p>
                  <Badge>{parameter.output?.type ?? 'Not configured'}</Badge>
                  {parameter.output && (
                    <CopyButton text={parameter.output.address} label="Copy output" />
                  )}
                </div>
              </div>
              <pre className="bounded-json">{JSON.stringify(parameter, null, 2)}</pre>
              <p className="tiny muted">
                Mappings describe the file configuration. Use the live inspector to observe received
                values.
              </p>
            </section>
          )}
          <details className="panel">
            <summary>Full OSC configuration JSON</summary>
            <pre className="bounded-json">{JSON.stringify(shown, null, 2)}</pre>
          </details>
          <h3>Parameter history</h3>
          {snapshots.map((s, i) => (
            <div className="activity-row" key={s.id}>
              <span className="grow">{dateText(s.created_at)}</span>
              <Button
                size="sm"
                disabled={i === snapshots.length - 1}
                onClick={() =>
                  setDiff(
                    compareOsc(
                      oscSchema.parse(JSON.parse(snapshots[i + 1].data_json)),
                      oscSchema.parse(JSON.parse(s.data_json)),
                    ),
                  )
                }
              >
                Compare with previous
              </Button>
            </div>
          ))}
        </>
      ) : (
        <Empty
          title="No local OSC configuration found for this avatar"
          description="Enable OSC in VRChat and use this avatar, then refresh. You can also import a local OSC JSON file."
        />
      )}
      {diff && (
        <DiffDialog title="Parameter changes" differences={diff} onClose={() => setDiff(null)} />
      )}
    </section>
  );
}
