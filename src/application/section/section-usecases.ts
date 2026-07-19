// セクション管理のユースケース（S-03 / 画面定義書03 §3.1）
import type { SectionRepository } from "@/application/ports/section-repository";
import {
  canArchive,
  sectionRanges,
  validateSectionInput,
  type Section,
  type SectionError,
  type SectionId,
  type SectionRange,
} from "@/domain/section/section";
import { ok, type Result } from "@/domain/shared/result";

export type SectionListView = Readonly<{
  ranges: readonly SectionRange[];
  archived: readonly Section[];
}>;

export async function listSections(repo: SectionRepository): Promise<SectionListView> {
  const all = await repo.listAll();
  return {
    ranges: sectionRanges(all),
    archived: all.filter((s) => s.isArchived),
  };
}

export async function createSection(
  repo: SectionRepository,
  input: Readonly<{ name: string; startTime: string }>
): Promise<Result<Section, SectionError>> {
  const validated = validateSectionInput(input, await repo.listAll());
  if (!validated.ok) return validated;
  return ok(await repo.create(validated.value));
}

export async function updateSection(
  repo: SectionRepository,
  id: SectionId,
  input: Readonly<{ name: string; startTime: string }>
): Promise<Result<SectionId, SectionError>> {
  const validated = validateSectionInput(input, await repo.listAll(), id);
  if (!validated.ok) return validated;
  await repo.update(id, validated.value);
  return ok(id);
}

export async function archiveSection(
  repo: SectionRepository,
  id: SectionId
): Promise<Result<SectionId, SectionError>> {
  const allowed = canArchive(await repo.listAll(), id);
  if (!allowed.ok) return allowed;
  await repo.setArchived(id, true);
  return ok(id);
}

/** 復元は有効セクションへの復帰なので、開始時刻の重複検査が要る */
export async function restoreSection(
  repo: SectionRepository,
  id: SectionId
): Promise<Result<SectionId, SectionError>> {
  const all = await repo.listAll();
  const target = all.find((s) => s.id === id);
  if (target === undefined) return ok(id);

  const validated = validateSectionInput(
    { name: target.name, startTime: target.startTime },
    all,
    id
  );
  if (!validated.ok) return validated;

  await repo.setArchived(id, false);
  return ok(id);
}
