import { vrchat } from '../api/VRChatApiClient';
import { repository } from '../db/repository';
import type { Avatar, Difference } from '../types/domain';
import { compareAvatarSnapshots } from '../utils/domain';
export interface DetectedUpdate {
  avatar: Avatar;
  differences: Difference[];
}
let queue = Promise.resolve();
export function refreshAvatar(
  avatar: Avatar,
  active: () => boolean = () => true,
): Promise<DetectedUpdate> {
  const work = queue.then(async () => {
    if (!active()) throw new Error('Refresh cancelled');
    if (!avatar.vrchat_id) throw new Error('This tracker is not linked to VRChat');
    const data = await vrchat.refreshAvatar(avatar.vrchat_id);
    if (!active()) throw new Error('Refresh cancelled');
    const diff = compareAvatarSnapshots(avatar.data, data);
    await repository.saveAvatar(data, avatar);
    return { avatar, differences: diff.differences };
  });
  queue = work.then(
    () => undefined,
    () => undefined,
  );
  return work;
}
