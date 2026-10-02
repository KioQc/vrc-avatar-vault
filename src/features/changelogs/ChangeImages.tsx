import { useQuery } from '@tanstack/react-query';
import { repository } from '../../db/repository';
import { useAttachmentUrl } from '../../services/files';
import { AvatarImage } from '../../components/common';
import type { Attachment } from '../../types/domain';
function Thumbnail({ attachment }: { attachment: Attachment }) {
  const url = useAttachmentUrl(attachment.path);
  return (
    <figure>
      <figcaption>
        {attachment.type}
        {attachment.caption ? ` · ${attachment.caption}` : ''}
      </figcaption>
      <a href={url ?? undefined} target="_blank" rel="noreferrer">
        <AvatarImage src={url} name={attachment.caption || attachment.type} />
      </a>
    </figure>
  );
}
export function ChangeImages({ avatarId, entryId }: { avatarId: string; entryId: string }) {
  const { data: images = [] } = useQuery({
    queryKey: ['attachments', avatarId],
    queryFn: () => repository.attachments(avatarId),
  });
  const selected = images.filter((a) => a.changelog_entry_id === entryId);
  return selected.length ? (
    <div className="change-images">
      {selected.map((a) => (
        <Thumbnail key={a.id} attachment={a} />
      ))}
    </div>
  ) : null;
}
