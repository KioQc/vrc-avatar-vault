import type { Avatar } from '../../types/domain';
import { CopyButton, dateText } from '../../components/common';
export function JsonPanel({ avatar }: { avatar: Avatar }) {
  const json = JSON.stringify(avatar.data, null, 2);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Avatar JSON</h2>
        <CopyButton text={json} label="Copy JSON" />
      </div>
      <p className="muted">
        Stored VRChat metadata, refreshed {dateText(avatar.last_api_refresh_at)}. All package
        variants and original performance values are preserved. Authentication fields are excluded.
      </p>
      <pre
        tabIndex={0}
        aria-label="Avatar JSON"
        style={{ maxHeight: '65vh', overflow: 'auto', whiteSpace: 'pre' }}
      >
        {json}
      </pre>
    </section>
  );
}
