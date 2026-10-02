import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { desktop, mockMode } from '../../db/bridge';
import { useAction, useSettings } from '../../hooks/useVault';
import { repository } from '../../db/repository';
import { Button } from '../../components/ui/button';
import { CopyButton, ErrorNotice } from '../../components/common';
import { rulesFrom, defaultRules } from '../../utils/studio';
export function IntegrationSettings() {
  const [port, setPort] = useState('17861'),
    [token, setToken] = useState('');
  const { data: settings = {} } = useSettings();
  const status = useQuery({
    queryKey: ['integration-status'],
    queryFn: () =>
      invoke<{
        running: boolean;
        port?: number;
        presence?: { project: string; scene: string; avatar: string; at: number };
      }>('integration_control', { operation: 'status' }),
    enabled: desktop && !mockMode,
    refetchInterval: 5000,
  });
  const action = useAction(async (operation: string) => {
    const result = await invoke<{ token?: string }>('integration_control', {
      operation,
      port: Number(port),
    });
    if (result.token) setToken(result.token);
  });
  const [rulesDraft, setRulesDraft] = useState<string | null>(null);
  const rules = rulesDraft ?? JSON.stringify(rulesFrom(settings.sdkRules), null, 2);
  const save = useAction(async () => {
    const value = JSON.parse(rules);
    for (const key of Object.keys(defaultRules).filter((k) => k !== 'version'))
      if (typeof value[key] !== 'number' || value[key] <= 0 || value[key] > 1000000)
        throw new Error(`Invalid ${key}`);
    await repository.setting('sdkRules', JSON.stringify(value));
  });
  const live = status.data?.presence;
  const connected = live && Date.now() / 1000 - live.at < 30;
  return (
    <>
      <section className="panel">
        <h2>Unity Bridge · local integration</h2>
        <p className="muted">
          Disabled on every app start. Only 127.0.0.1 is used. Protocol v1 supports authenticated
          REST requests and incremental event polling; no network-wide access.
        </p>
        <div className="row">
          <input
            aria-label="Integration port"
            type="number"
            min={1024}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
          <Button
            disabled={!desktop || mockMode || action.isPending}
            onClick={() => action.mutate(status.data?.running ? 'stop' : 'start')}
          >
            {status.data?.running ? 'Stop local API' : 'Enable local API'}
          </Button>
        </div>
        <p>{status.data?.running ? `Listening on 127.0.0.1:${status.data.port}` : 'Stopped'}</p>
        {status.error && <ErrorNotice error={status.error} />}
        <div className="row wrap">
          <Button disabled={!desktop || mockMode} onClick={() => action.mutate('token')}>
            Reveal / create token
          </Button>
          <Button
            disabled={!desktop || mockMode}
            onClick={() => {
              if (window.confirm('Stop the API and invalidate the current Unity Bridge token?'))
                action.mutate('rotate');
            }}
          >
            Regenerate token
          </Button>
          {token && (
            <>
              <input aria-label="Integration token" type="password" value={token} readOnly />
              <CopyButton text={token} label="Copy token" />
              <Button onClick={() => setToken('')}>Hide</Button>
            </>
          )}
        </div>
        <p className="tiny muted">
          The token is stored in Windows Credential Manager and excluded from exports and logs.
          Paste it into Tools → VRC Avatar Vault in Unity.
        </p>
        <h3>Unity status</h3>
        <p>
          {connected ? 'Connected' : 'No recent heartbeat'}
          {live ? ` · ${live.project} · ${live.scene} · ${live.avatar}` : ''}
        </p>
      </section>
      <section className="panel">
        <h2>Versioned SDK advisory rules</h2>
        <p className="muted">
          Parameter cost and Quest recommendations used by the inspectors. These checks complement
          the VRChat SDK; they do not replace its build validation.
        </p>
        <textarea
          aria-label="SDK rules JSON"
          rows={10}
          value={rules}
          onChange={(e) => setRulesDraft(e.target.value)}
        />
        <div className="row">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save rules
          </Button>
          <Button onClick={() => setRulesDraft(JSON.stringify(defaultRules, null, 2))}>
            Load defaults
          </Button>
        </div>
        <p className="tiny muted">
          References:{' '}
          <a
            href="https://creators.vrchat.com/avatars/animator-parameters/"
            target="_blank"
            rel="noreferrer"
          >
            VRChat parameters
          </a>{' '}
          ·{' '}
          <a
            href="https://creators.vrchat.com/platforms/android/quest-content-limitations/"
            target="_blank"
            rel="noreferrer"
          >
            Android limitations
          </a>
        </p>
      </section>
    </>
  );
}
