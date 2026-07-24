// セクション管理のユースケース（S-03 / 画面定義書03 §3.1）
import type { SectionRepository } from "@/usecases/ports/section-repository";
import {
  canArchive,
  sectionRanges,
  validateSectionInput,
  type Section,
  type SectionError,
  type SectionId,
  type SectionRange,
} from "@/domain/section/section";
import {
  canDeleteMaster,
  deletableMasterIds,
  type MasterDeletionError,
} from "@/domain/shared/master-deletion";
import { ok, type Result } from "@/domain/shared/result";

export type SectionListView = Readonly<{
  ranges: readonly SectionRange[];
  archived: readonly Section[];
  /** 物理削除できる（参照0件の）アーカイブ済みセクションの id（画面定義書03 §4.1） */
  deletableIds: readonly SectionId[];
}>;

export async function listSections(repo: SectionRepository): Promise<SectionListView> {
  const all = await repo.listAll();
  const archived = all.filter((s) => s.isArchived);
  const counts =
    archived.length === 0 ? {} : await repo.referenceCounts(archived.map((s) => s.id));

  return {
    ranges: sectionRanges(all),
    archived,
    deletableIds: deletableMasterIds(archived, counts),
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

/**
 * 日界セクション（1日の開始。F-116）を切り替える（画面定義書03 §3.1）。
 * 対象は有効セクションのみ。切替は1件を立て他を下ろす（repo 側で原子的に処理）。
 */
export async function setDayStartSection(
  repo: SectionRepository,
  id: SectionId
): Promise<Result<SectionId, SectionError>> {
  const target = (await repo.listAll()).find((s) => s.id === id);
  if (target === undefined || target.isArchived) return ok(id);
  await repo.setDayStart(id);
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

/**
 * 物理削除（画面定義書03 §4.1）。対象はアーカイブ済みのみのため、
 * 「有効セクション最低1件」の制約には抵触しない。
 * ボタン表示後に参照が生まれている可能性があるため、削除直前にサーバ側で再チェックする
 */
export async function deleteSection(
  repo: SectionRepository,
  id: SectionId
): Promise<Result<SectionId, MasterDeletionError>> {
  const target = (await repo.listAll()).find((s) => s.id === id) ?? null;
  const counts = await repo.referenceCounts([id]);

  const deletable = canDeleteMaster(target, counts[id] ?? 0);
  if (!deletable.ok) return deletable;

  await repo.remove(id);
  return ok(id);
}
