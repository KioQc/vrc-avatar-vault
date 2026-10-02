import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings, useAction } from '../../hooks/useVault';
import { repository } from '../../db/repository';
import { Button } from '../../components/ui/button';
export function AISettings() {
  const { data: s = {} } = useSettings();
  const [provider, setProvider] = useState<string | null>(null),
    [endpoint, setEndpoint] = useState<string | null>(null),
    [model, setModel] = useState<string | null>(null),
    [key, setKey] = useState('');
  const save = useAction(async () => {
    await repository.setting('aiProvider', provider ?? s.aiProvider ?? 'disabled');
    await repository.setting(
      'aiEndpoint',
      endpoint ?? s.aiEndpoint ?? 'http://127.0.0.1:11434/api/chat',
    );
    await repository.setting('aiModel', model ?? s.aiModel ?? '');
  }, 'AI settings saved');
  const secret = useAction(async () => {
    await invoke('ai_request', {
      operation: 'save-key',
      payload: { endpoint: endpoint ?? s.aiEndpoint ?? 'http://127.0.0.1:11434/api/chat', key },
    });
    setKey('');
  }, 'Provider key updated');
  return (
    <section className="panel">
      <h2>Optional AI release notes</h2>
      <p className="muted">
        Disabled by default. All essential functions work without AI. Generation previews the exact
        text and destination before sending; the result remains editable.
      </p>
      <div className="form-grid">
        <label>
          Provider
          <select
            value={provider ?? s.aiProvider ?? 'disabled'}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="disabled">Disabled</option>
            <option value="ollama">Ollama</option>
            <option value="compatible">Compatible chat completions API</option>
          </select>
        </label>
        <label>
          Full endpoint URL
          <input
            value={endpoint ?? s.aiEndpoint ?? 'http://127.0.0.1:11434/api/chat'}
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </label>
        <label>
          Model
          <input value={model ?? s.aiModel ?? ''} onChange={(e) => setModel(e.target.value)} />
        </label>
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        Save AI configuration
      </Button>
      <label>
        API key (optional, bound to this endpoint)
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <Button onClick={() => secret.mutate()} disabled={secret.isPending}>
        {key ? 'Store key securely' : 'Remove key for this endpoint'}
      </Button>
      <p className="tiny muted">
        Keys stay in Windows Credential Manager, outside exports. Set a complete /api/chat or
        /v1/chat/completions endpoint. No model is downloaded automatically.
      </p>
    </section>
  );
}
