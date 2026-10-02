import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { repository } from '../../db/repository';
import { useSettings, useAction } from '../../hooks/useVault';
import { Button } from '../../components/ui/button';
import { saveText } from '../../services/files';
import { studio } from '../../services/studio';
export function ReleaseNotesPanel({ avatarId }: { avatarId: string }) {
  const { data: settings = {} } = useSettings();
  const changes = useQuery({
    queryKey: ['changes', avatarId],
    queryFn: () => repository.changes(avatarId),
  });
  const [details, setDetails] = useState(false),
    [preview, setPreview] = useState<string | null>(null),
    [destination, setDestination] = useState(''),
    [draft, setDraft] = useState('');
  const prepare = useAction(async () => {
    let text = (changes.data ?? [])
      .filter((c) => !c.release_id)
      .map((c) => `[${c.categories.join(', ')}] ${c.title}${details ? ' — ' + c.description : ''}`)
      .join('\n');
    if (details) {
      const latest = (await studio.snapshots(avatarId)).find((s) => s.kind === 'technical');
      if (latest) {
        const data = JSON.parse(latest.data_json);
        text += '\nTechnical metrics: ' + JSON.stringify(data.metrics ?? {});
      }
    }
    text = text
      .split('\n')
      .filter(
        (line) =>
          ![
            'password',
            'cookie',
            'bearer ',
            'auth=',
            'token=',
            ':\\',
            ':/',
            '/users/',
            '/home/',
          ].some((s) => line.toLowerCase().includes(s)),
      )
      .join('\n');
    setPreview(text);
    setDestination(settings.aiEndpoint ?? '');
  });
  const generate = useAction(async () => {
    const result = await invoke<{ text: string }>('ai_request', {
      operation: 'generate',
      payload: { text: preview, approvedEndpoint: destination },
    });
    setDraft(result.text);
  });
  return (
    <section className="panel">
      <h2>Release notes draft</h2>
      <p className="muted">
        Generate only from unreleased changes you review below. No VRChat credentials, complete
        database, project files or filesystem paths are selected.
      </p>
      <label className="check-row">
        <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />
        Include changelog descriptions and available technical metrics
      </label>
      <Button
        disabled={!settings.aiProvider || settings.aiProvider === 'disabled' || prepare.isPending}
        onClick={() => prepare.mutate()}
      >
        Prepare payload preview
      </Button>
      {(!settings.aiProvider || settings.aiProvider === 'disabled') && (
        <p>Configure an optional provider in Settings first.</p>
      )}
      {preview !== null && (
        <>
          <p className="notice">
            Destination: {destination} · Model: {settings.aiModel}. Review and remove any private
            information you do not want to send.
          </p>
          <textarea
            aria-label="Exact AI payload preview"
            rows={10}
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
          />
          <Button
            disabled={!preview.trim() || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? 'Generating…' : 'Send reviewed text & generate draft'}
          </Button>
        </>
      )}
      <label>
        Editable draft
        <textarea rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <Button disabled={!draft.trim()} onClick={() => void saveText('RELEASE-NOTES.md', draft)}>
        Export edited draft
      </Button>
    </section>
  );
}
