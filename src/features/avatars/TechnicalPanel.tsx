import type { Avatar } from '../../types/domain';
import { Badge, CopyButton, dateText } from '../../components/common';
import { platformName, platforms, isImpostorPackage, performanceLabel } from '../../utils/domain';
export function TechnicalPanel({ avatar }: { avatar: Avatar }) {
  return (
    <>
      <div className="section-heading">
        <h2>Technical information</h2>
        <CopyButton text={JSON.stringify(avatar.data, null, 2)} label="Copy technical info" />
      </div>
      <div className="panel">
        <dl className="definition-grid">
          <dt>Native platforms</dt>
          <dd>{platforms(avatar.data).join(', ') || 'No native build listed'}</dd>
          <dt>Avatar ID</dt>
          <dd>{avatar.vrchat_id ?? 'Unlinked local tracker'}</dd>
          <dt>Author</dt>
          <dd>
            {avatar.data.authorName} · {avatar.data.authorId}
          </dd>
          <dt>VRChat version</dt>
          <dd>{avatar.data.version}</dd>
          <dt>Release status</dt>
          <dd>{avatar.data.releaseStatus}</dd>
          <dt>Featured / searchable / pending upload</dt>
          <dd>
            {[avatar.data.featured, avatar.data.searchable, avatar.data.pendingUpload]
              .map(String)
              .join(' / ')}
          </dd>
        </dl>
      </div>
      <p className="muted">
        Native builds determine platform compatibility. Impostors are fallback representations,
        listed separately below. Unknown means VRChat did not provide a known rating; None means
        this package is not rated.
      </p>
      <div className="package-grid">
        {avatar.data.unityPackages.map((p, i) => (
          <section className="panel" key={`${p.id}-${i}`}>
            <div className="row between">
              <h3>
                {platformName(p.platform)} · {isImpostorPackage(p) ? 'Impostor' : 'Native build'}
              </h3>
              <Badge>{performanceLabel(p.performanceRating)}</Badge>
            </div>
            <dl className="definition-grid">
              <dt>performanceRating (API)</dt>
              <dd>
                <code>{p.performanceRating}</code>
              </dd>
              <dt>Package ID</dt>
              <dd>{p.id || 'Unknown'}</dd>
              <dt>Asset version</dt>
              <dd>{p.assetVersion}</dd>
              <dt>Unity</dt>
              <dd>{p.unityVersion}</dd>
              <dt>Variant</dt>
              <dd>{p.variant || 'Unknown'}</dd>
              <dt>Upload date</dt>
              <dd>{dateText(p.created_at)}</dd>
              <dt>Scan status</dt>
              <dd>{String(p.scanStatus ?? 'Not provided')}</dd>
              <dt>Unity sort number</dt>
              <dd>{String(p.unitySortNumber ?? 'Not provided')}</dd>
              <dt>Impostor generator</dt>
              <dd>{String(p.impostorizerVersion ?? 'Not applicable / not provided')}</dd>
            </dl>
          </section>
        ))}
      </div>
      <section className="panel">
        <h3>VRChat tags and styles</h3>
        <div className="row wrap">
          {avatar.data.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
        <pre>{JSON.stringify(avatar.data.styles, null, 2)}</pre>
      </section>
      <details className="panel">
        <summary>Raw VRChat JSON</summary>
        <CopyButton text={JSON.stringify(avatar.data, null, 2)} label="Copy JSON" />
        <pre>{JSON.stringify(avatar.data, null, 2)}</pre>
      </details>
    </>
  );
}
