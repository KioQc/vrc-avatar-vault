import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { Radio, Play, Square, Pause, Download } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge, CopyButton, ErrorNotice } from '../../components/common';
import { saveText } from '../../services/files';
export interface OscMessage {
  address: string;
  types: string;
  values: unknown[];
  at: number;
}
export interface OscLive {
  running: boolean;
  port: number;
  packets: number;
  rejected: number;
  last_received: number | null;
  avatar_id: string | null;
  error: string | null;
  values: Record<string, OscMessage>;
  recent: OscMessage[];
}
export function OscLivePanel() {
  const client = useQueryClient();
  const [port, setPort] = useState('9001'),
    [search, setSearch] = useState(''),
    [type, setType] = useState('all'),
    [selected, setSelected] = useState(''),
    [frozen, setFrozen] = useState<OscLive | null>(null);
  const query = useQuery({
    queryKey: ['osc-live'],
    queryFn: () => invoke<OscLive>('osc_monitor', { operation: 'snapshot' }),
    refetchInterval: 500,
  });
  const action = useMutation({
    mutationFn: async (operation: string) => {
      if (operation === 'export')
        return saveText('osc-capture.json', JSON.stringify(frozen ?? query.data, null, 2));
      await invoke('osc_monitor', { operation, port: Number(port) });
      setFrozen(null);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['osc-live'] }),
  });
  const data = frozen ?? query.data,
    message = data?.values[selected];
  const rows = Object.values(data?.values ?? {})
    .filter(
      (m) =>
        m.address.toLowerCase().includes(search.toLowerCase()) &&
        (type === 'all' || m.types.includes(type)),
    )
    .sort((a, b) => a.address.localeCompare(b.address));
  const samples = (data?.recent ?? [])
    .filter((m) => m.address === selected && typeof m.values[0] === 'number')
    .slice(0, 40)
    .reverse();
  const numbers = samples.map((m) => m.values[0] as number);
  const low = Math.min(...numbers),
    high = Math.max(...numbers);
  const firstTime = samples[0]?.at ?? 0,
    lastTime = samples.at(-1)?.at ?? 0;
  const points = samples
    .map(
      (m) =>
        `${5 + (270 * (m.at - firstTime)) / Math.max(1, lastTime - firstTime)},${65 - (55 * ((m.values[0] as number) - low)) / Math.max(0.00001, high - low)}`,
    )
    .join(' ');
  const recent = data?.last_received ? Date.now() - data.last_received < 5000 : false;
  return (
    <div className="inspector-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>
              <Radio size={18} /> OSC live inspector
            </h2>
            <p>Read-only UDP receiver on this PC. No values are sent to the game.</p>
          </div>
          <Badge tone={query.data?.running ? (recent ? 'green' : 'warning') : ''}>
            {query.data?.running
              ? recent
                ? 'Receiving'
                : 'Listening · waiting for packets'
              : 'Stopped'}
          </Badge>
        </div>
        <div className="row wrap">
          <label>
            Receive port{' '}
            <input
              aria-label="OSC receive port"
              type="number"
              min="1024"
              max="65535"
              value={port}
              disabled={query.data?.running}
              onChange={(e) => setPort(e.target.value)}
            />
          </label>
          <Button
            disabled={
              action.isPending ||
              query.data?.running ||
              !Number.isInteger(Number(port)) ||
              Number(port) < 1024 ||
              Number(port) > 65535 ||
              Number(port) === 9000
            }
            onClick={() => action.mutate('start')}
          >
            <Play size={14} />
            Start listening
          </Button>
          <Button
            disabled={action.isPending || !query.data?.running}
            onClick={() => action.mutate('stop')}
          >
            <Square size={14} />
            Stop
          </Button>
          <Button
            disabled={!query.data}
            onClick={() => setFrozen(frozen ? null : (query.data ?? null))}
          >
            <Pause size={14} />
            {frozen ? 'Resume display' : 'Freeze display'}
          </Button>
          <Button onClick={() => action.mutate('clear')}>Clear capture</Button>
          <Button disabled={!data} onClick={() => action.mutate('export')}>
            <Download size={14} />
            Export capture
          </Button>
        </div>
        <p className="tiny muted">
          VRChat normally sends OSC to port 9001. Enable OSC in the game's Action Menu. If another
          tool uses that port, use its forwarding feature or configure a different output port in
          VRChat. This listener does not change game settings or stop other tools. It stays active
          until stopped or Avatar Vault closes.
        </p>
        {(query.error || action.error || data?.error) && (
          <ErrorNotice error={query.error ?? action.error ?? data?.error} />
        )}
      </section>
      <div className="stats-grid">
        <div className="stat-card">
          <span>Packets received</span>
          <strong>{data?.packets ?? 0}</strong>
          <small>Since listener start / clear</small>
        </div>
        <div className="stat-card">
          <span>Observed addresses</span>
          <strong>{Object.keys(data?.values ?? {}).length}</strong>
          <small>Up to 1,024 latest addresses</small>
        </div>
        <div className="stat-card">
          <span>Last packet</span>
          <strong className="stat-small">
            {data?.last_received
              ? new Date(data.last_received).toLocaleTimeString()
              : 'Not received'}
          </strong>
          <small>{frozen ? 'Display frozen' : 'Local receive time'}</small>
        </div>
        <div className="stat-card">
          <span>Rejected packets</span>
          <strong>{data?.rejected ?? 0}</strong>
          <small>Malformed or unsupported OSC</small>
        </div>
      </div>
      <p className="notice">
        Avatar reported by /avatar/change:{' '}
        <code>
          {data?.avatar_id ?? 'Not identified yet — switch/reload your avatar with OSC enabled.'}
        </code>{' '}
        Values are received from local OSC senders; they are not inferred from configuration files.
        Changing avatars clears the previous values.
      </p>
      <div className="inspector-columns">
        <section className="panel">
          <div className="row wrap">
            <input
              aria-label="Filter live OSC addresses"
              placeholder="Search OSC address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="OSC value type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">All types</option>
              <option value="f">Float</option>
              <option value="i">Int</option>
              <option value="T">True</option>
              <option value="F">False</option>
              <option value="s">String</option>
            </select>
          </div>
          <p className="tiny muted">{rows.length} matching addresses · select a row for details</p>
          <div className="osc-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Latest value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.address} className={selected === m.address ? 'selected-row' : ''}>
                    <td>
                      <button className="parameter-link" onClick={() => setSelected(m.address)}>
                        {m.address}
                      </button>
                    </td>
                    <td>
                      <Badge>{m.types}</Badge>
                    </td>
                    <td className="osc-value">{JSON.stringify(m.values)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="muted inspector-empty">
                No matching packets received. Waiting is not a connection failure.
              </p>
            )}
          </div>
        </section>
        <section className="panel inspector-detail">
          <h2>Selected signal</h2>
          {message ? (
            <>
              <code className="break-all">{message.address}</code>
              <CopyButton text={message.address} label="Copy address" />
              <dl className="definition-grid">
                <dt>Type tags</dt>
                <dd>{message.types}</dd>
                <dt>Received</dt>
                <dd>{new Date(message.at).toLocaleString()}</dd>
                <dt>Value</dt>
                <dd className="osc-value">{JSON.stringify(message.values)}</dd>
              </dl>
              {numbers.length > 1 && (
                <div>
                  <svg
                    className="signal-plot"
                    viewBox="0 0 280 75"
                    role="img"
                    aria-label={`Recent ${selected} samples, minimum ${low}, maximum ${high}`}
                  >
                    <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" />
                  </svg>
                  <p className="tiny muted">
                    Observed range: {low.toFixed(4)} – {high.toFixed(4)} · {numbers.length} samples
                    in the recent buffer
                  </p>
                </div>
              )}
              <h3>Recent samples</h3>
              <div className="signal-history">
                {data?.recent
                  .filter((m) => m.address === selected)
                  .slice(0, 40)
                  .map((m, i) => (
                    <div className="row between" key={i}>
                      <span className="tiny muted">{new Date(m.at).toLocaleTimeString()}</span>
                      <code>{JSON.stringify(m.values)}</code>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <p className="muted">
              Choose a received address to inspect its value and recent samples. Captures stay in
              memory unless you export them.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
