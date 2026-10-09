import { vrchat } from '../api/VRChatApiClient';
import { repository } from '../db/repository';
import type { Avatar } from '../types/domain';
export interface ImportReport {
  imported: number;
  refreshed: number;
  skipped: number;
  failures: { id: string; message: string }[];
}
export async function importAvatars(
  ids: string[],
  updateExisting: boolean,
  onProgress: (current: number, total: number) => void,
): Promise<ImportReport> {
  const report: ImportReport = { imported: 0, refreshed: 0, skipped: 0, failures: [] };
  const existing = new Map<string, Avatar>(
    (await repository.avatars())
      .filter((a) => a.vrchat_id)
      .map((a) => [a.vrchat_id!.toLowerCase(), a]),
  );
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
  for (const [index, id] of unique.entries()) {
    onProgress(index + 1, unique.length);
    const previous = existing.get(id);
    if (previous && !updateExisting) {
      report.skipped++;
      continue;
    }
    try {
      const data = await vrchat.refreshAvatar(id);
      await repository.saveAvatar(data, previous);
      if (previous) report.refreshed++;
      else report.imported++;
    } catch (error) {
      report.failures.push({ id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
