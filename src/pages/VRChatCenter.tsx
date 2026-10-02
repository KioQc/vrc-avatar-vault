import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { Activity, RefreshCw, Radio, Globe, UserRound, FileJson } from 'lucide-react';
import { useAvatars } from '../hooks/useVault';
import { useUI } from '../stores/ui';
import { Badge, CopyButton, ErrorNotice, Loading } from '../components/common';
import { Button } from '../components/ui/button';
import { OscPanel } from '../features/avatars/OscPanel';
import { OscLivePanel } from '../features/vrchat/OscLivePanel';
import { TechnicalPanel } from '../features/avatars/TechnicalPanel';
import { sanitize } from '../utils/domain';
import { openFolder, saveText } from '../services/files';
interface GameInfo {
  available: boolean;
  reason?: string;
  source?: string;
  sampled_at: number;
  log_modified_at?: number;
  log_path?: string;
  log_bytes?: number;
  log_count?: number;
  partial_sample?: boolean;
  build?: string;
  unity?: string;
  world_name?: string;
  world_id?: string;
  instance?: string;
  oscquery_port?: number;
  osc_input_port?: number;
  warnings_in_sample?: number;
  errors_in_sample?: number;
  events?: { at: string; kind: string; detail: string }[];
}
interface QueryCapture {
  port: number;
  sampled_at: number;
  tree: Record<string, unknown>;
}
function value(v: unknown) {
  return v === null || v === undefined || v === ''
    ? 'Not supplied'
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v);
}
function Fields({ data, fields }: { data: Record<string, unknown>; fields: string[] }) {
  return (
    <dl className="definition-grid">
      {fields.map((k) => (
        <div className="definition-pair" key={k}>
          <dt>{k.replaceAll('_', ' ')}</dt>
          <dd className="break-all">{value(data[k])}</dd>
        </div>
      ))}
    </dl>
  );
}
function Raw({ data, label = 'JSON' }: { data: unknown; label?: string }) {
  return (
    <details className="panel">
      <summary>{label}</summary>
      <CopyButton text={JSON.stringify(data, null, 2)} label="Copy JSON" />
      <pre className="bounded-json">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}
function flatten(tree: Record<string, unknown>) {
  const rows: Record<string, unknown>[] = [];
  function walk(n: Record<string, unknown>, depth: number) {
    if (depth > 16 || rows.length >= 4096) return;
    rows.push(n);
    if (n.CONTENTS && typeof n.CONTENTS === 'object')
      for (const c of Object.values(n.CONTENTS))
        if (c && typeof c === 'object') walk(c as Record<string, unknown>, depth + 1);
  }
  walk(tree, 0);
  return rows;
}
export function VRChatCenter() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'Session';
  const { data: avatars = [] } = useAvatars();
  const [selectedId, setSelectedId] = useState('');
  const avatar = avatars.find((a) => a.id === selectedId) ?? avatars[0];
  const user = useUI((s) => s.user);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [worldFetchedAt, setWorldFetchedAt] = useState<number | null>(null);
  const [treeSearch, setTreeSearch] = useState('');
  const game = useQuery({
    queryKey: ['game-diagnostics'],
    queryFn: () => invoke<GameInfo>('game_diagnostics'),
    enabled: tab === 'Session' || tab === 'OSCQuery' || tab === 'API',
    refetchInterval: tab === 'Session' ? 10000 : false,
  });
  const profile = useQuery({
    queryKey: ['vrchat-profile', user?.id],
    queryFn: async () =>
      sanitize(await invoke('vrchat', { operation: 'profile', payload: {} })) as Record<
        string,
        unknown
      >,
    enabled: tab === 'API' && !!user?.id,
    staleTime: 60000,
  });
  const world = useMutation({
    onSuccess: () => setWorldFetchedAt(Date.now()),
    mutationFn: async (id: string) =>
      sanitize(await invoke('vrchat', { operation: 'world', payload: { id } })) as Record<
        string,
        unknown
      >,
  });
  const query = useMutation({ mutationFn: () => invoke<QueryCapture>('oscquery_snapshot') });
  const folder = useMutation({ mutationFn: () => openFolder('vrchat') });
  const exported = useMutation({
    mutationFn: () =>
      saveText('vrchat-session-diagnostics.json', JSON.stringify(game.data, null, 2)),
  });
  const chosenWorld = worldId ?? game.data?.world_id ?? '';
  const nodes = query.data
    ? flatten(query.data.tree).filter((n) =>
        JSON.stringify([n.FULL_PATH, n.TYPE, n.DESCRIPTION])
          .toLowerCase()
          .includes(treeSearch.toLowerCase()),
      )
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIVE TOOLS & INSPECTION</p>
          <h1>VRChat Center</h1>
          <p>Your avatar, session and signals — with their sources visible.</p>
        </div>
        <Badge tone={user?.id ? 'green' : ''}>
          {user?.id ? 'API account connected' : 'Offline workspace'}
        </Badge>
      </div>
      <div className="tabs" role="tablist" aria-label="VRChat information sections">
        {['Session', 'API', 'OSC live', 'OSC config', 'OSCQuery'].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => setParams({ tab: t })}
          >
            {t === 'Session' ? (
              <Activity size={14} />
            ) : t === 'API' ? (
              <Globe size={14} />
            ) : (
              <Radio size={14} />
            )}{' '}
            {t}
          </button>
        ))}
      </div>
      <div className="tab-content inspector-stack">
        {tab === 'Session' && (
          <>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Local game diagnostics</h2>
                  <p>
                    Read from the latest VRChat output log on this computer. Checked every 10
                    seconds.
                  </p>
                </div>
                <div className="row wrap">
                  <Button onClick={() => void game.refetch()} disabled={game.isFetching}>
                    <RefreshCw size={14} />
                    Refresh
                  </Button>
                  <Button onClick={() => folder.mutate()}>Open game data folder</Button>
                  <Button disabled={!game.data} onClick={() => exported.mutate()}>
                    Export diagnostics
                  </Button>
                </div>
              </div>
              <p className="notice">
                These are the last recorded session details, not proof that the game is currently
                running. No player tracking or raw log upload is performed. The exported report
                includes the displayed world/instance information.
              </p>
              {(game.error || folder.error || exported.error) && (
                <ErrorNotice error={game.error ?? folder.error ?? exported.error} />
              )}
              {game.isLoading && <Loading />}
              {game.data && !game.data.available && <p>{game.data.reason}</p>}
            </section>
            {game.data?.available && (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span>VRChat client build</span>
                    <strong className="stat-small">{game.data.build ?? 'Not found in log'}</strong>
                    <small>From local log</small>
                  </div>
                  <div className="stat-card">
                    <span>Last log activity</span>
                    <strong className="stat-small">
                      {new Date(game.data.log_modified_at ?? 0).toLocaleTimeString()}
                    </strong>
                    <small>{new Date(game.data.log_modified_at ?? 0).toLocaleDateString()}</small>
                  </div>
                  <div className="stat-card">
                    <span>OSC input / query ports</span>
                    <strong className="stat-small">
                      {game.data.osc_input_port ?? '—'} / {game.data.oscquery_port ?? '—'}
                    </strong>
                    <small>Advertised by the game</small>
                  </div>
                  <div className="stat-card">
                    <span>Warnings / errors in sample</span>
                    <strong>
                      {game.data.warnings_in_sample ?? 0} / {game.data.errors_in_sample ?? 0}
                    </strong>
                    <small>Counts of matching log lines</small>
                  </div>
                </div>
                <div className="inspector-columns">
                  <section className="panel">
                    <h2>Last recorded world</h2>
                    <h3>{game.data.world_name ?? 'Not found in log'}</h3>
                    <Fields
                      data={game.data as unknown as Record<string, unknown>}
                      fields={['world_id', 'instance', 'unity']}
                    />
                    {game.data.world_id && (
                      <Button
                        onClick={() => {
                          setWorldId(game.data!.world_id!);
                          setParams({ tab: 'API' });
                        }}
                      >
                        Inspect world via API
                      </Button>
                    )}
                  </section>
                  <section className="panel">
                    <h2>Collection details</h2>
                    <Fields
                      data={game.data as unknown as Record<string, unknown>}
                      fields={['log_path', 'log_bytes', 'log_count', 'partial_sample']}
                    />
                    <p className="tiny muted">
                      At most 256 KB of the beginning and 512 KB of the end are read. Events in an
                      omitted middle section are not counted.
                    </p>
                    <p className="tiny muted">
                      Collected {new Date(game.data.sampled_at).toLocaleString()}
                    </p>
                  </section>
                </div>
                <section className="panel">
                  <h2>Recent session events from the log sample</h2>
                  {game.data.events?.length ? (
                    game.data.events.map((e, i) => (
                      <div className="activity-row" key={i}>
                        <Badge>{e.kind}</Badge>
                        <span className="grow break-all">{e.detail}</span>
                        <time className="tiny muted">{e.at}</time>
                      </div>
                    ))
                  ) : (
                    <p className="muted">No session event found in the sampled log.</p>
                  )}
                </section>
              </>
            )}
          </>
        )}
        {tab === 'API' && (
          <>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>
                    <UserRound size={18} /> Account profile
                  </h2>
                  <p>VRChat API · permitted fields from your connected account.</p>
                </div>
                <Button
                  disabled={!user?.id || profile.isFetching}
                  onClick={() => void profile.refetch()}
                >
                  <RefreshCw size={14} />
                  Refresh profile
                </Button>
              </div>
              {!user?.id ? (
                <p>
                  Connect your account in <Link to="/settings">Settings</Link>.
                </p>
              ) : profile.isLoading ? (
                <Loading />
              ) : profile.error ? (
                <ErrorNotice error={profile.error} />
              ) : (
                profile.data && (
                  <>
                    <Fields
                      data={profile.data}
                      fields={[
                        'displayName',
                        'id',
                        'pronouns',
                        'status',
                        'statusDescription',
                        'date_joined',
                        'last_login',
                        'last_platform',
                        'allowAvatarCopying',
                        'worldId',
                        'instanceId',
                        'location',
                        'currentAvatar',
                        'bio',
                        'bioLinks',
                        'tags',
                      ]}
                    />
                    <p className="tiny muted">
                      Retrieved {new Date(profile.dataUpdatedAt).toLocaleString()}. API presence can
                      lag the game; absent fields remain unknown.
                    </p>
                  </>
                )
              )}
            </section>
            {profile.data && (
              <Raw data={profile.data} label="Account profile JSON (selected fields)" />
            )}
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>
                    <Globe size={18} /> World details
                  </h2>
                  <p>Look up the world recorded in your local session or enter a world ID.</p>
                </div>
              </div>
              <div className="row wrap">
                <input
                  aria-label="World ID"
                  placeholder="wrld_…"
                  value={chosenWorld}
                  onChange={(e) => setWorldId(e.target.value)}
                />
                <Button
                  disabled={
                    !user?.id || world.isPending || !/^wrld_[0-9a-f-]{36}$/i.test(chosenWorld)
                  }
                  onClick={() => world.mutate(chosenWorld)}
                >
                  Fetch world
                </Button>
              </div>
              {world.error && <ErrorNotice error={world.error} />}{' '}
              {world.data && (
                <>
                  <Fields
                    data={world.data}
                    fields={[
                      'name',
                      'id',
                      'authorName',
                      'authorId',
                      'description',
                      'releaseStatus',
                      'version',
                      'capacity',
                      'recommendedCapacity',
                      'occupants',
                      'publicOccupants',
                      'privateOccupants',
                      'created_at',
                      'updated_at',
                      'publicationDate',
                      'tags',
                    ]}
                  />
                  <p className="tiny muted">
                    VRChat API · retrieved{' '}
                    {worldFetchedAt ? new Date(worldFetchedAt).toLocaleString() : '—'}
                  </p>
                  <Raw data={world.data} label="World API JSON" />
                </>
              )}
            </section>
            <section className="panel">
              <h2>
                <FileJson size={18} /> Tracked avatar metadata
              </h2>
              <select
                aria-label="Avatar for API inspection"
                value={avatar?.id ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {avatars.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {avatar && (
                <p>
                  <Link to={`/avatars/${avatar.id}`}>
                    Open avatar to refresh API metadata or view full JSON
                  </Link>
                </p>
              )}
            </section>
            {avatar && <TechnicalPanel avatar={avatar} />}
          </>
        )}
        {tab === 'OSC live' && <OscLivePanel />}
        {tab === 'OSC config' && (
          <>
            <section className="panel">
              <h2>Avatar OSC configuration</h2>
              <p>Configuration describes addresses and types; it does not contain live values.</p>
              <select
                aria-label="Avatar for OSC configuration"
                value={avatar?.id ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {avatars.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </section>
            {avatar ? (
              <OscPanel key={avatar.id} avatar={avatar} />
            ) : (
              <p>Import an avatar first to inspect its local configuration.</p>
            )}
          </>
        )}
        {tab === 'OSCQuery' && (
          <>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>OSCQuery explorer</h2>
                  <p>Reads the local service on the port advertised in VRChat's latest log.</p>
                </div>
                <Button disabled={query.isPending} onClick={() => query.mutate()}>
                  <RefreshCw size={14} />
                  Read OSCQuery
                </Button>
              </div>
              <p className="notice">
                This is a point-in-time query response. Use OSC live for streamed changes. No
                discovery broadcasts or configuration changes are sent to the game.
              </p>
              {query.error && <ErrorNotice error={query.error} />}{' '}
              {query.data && (
                <>
                  <p className="tiny muted">
                    127.0.0.1:{query.data.port} · {new Date(query.data.sampled_at).toLocaleString()}{' '}
                    · up to 4,096 nodes
                  </p>
                  <input
                    aria-label="Search OSCQuery nodes"
                    placeholder="Search path, description or type…"
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                  />
                  <div className="osc-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Path</th>
                          <th>Type</th>
                          <th>Access</th>
                          <th>Reported value</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nodes.map((n, i) => (
                          <tr key={i}>
                            <td className="break-all">{value(n.FULL_PATH)}</td>
                            <td>{value(n.TYPE)}</td>
                            <td>
                              {n.ACCESS === 1
                                ? 'Read'
                                : n.ACCESS === 2
                                  ? 'Write'
                                  : n.ACCESS === 3
                                    ? 'Read / write'
                                    : value(n.ACCESS)}
                            </td>
                            <td className="osc-value">{value(n.VALUE)}</td>
                            <td>{value(n.DESCRIPTION)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
            {query.data && <Raw data={query.data} label="OSCQuery response JSON" />}
          </>
        )}
      </div>
    </>
  );
}
