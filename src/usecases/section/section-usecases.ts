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
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * 更新・アーカイブ・復元・日界切替で起こりうる失敗。入力検証や配置の制約（`SectionError`）に加えて、
 * **対象がすでに存在しない**場合を含む（画面定義書00_共通 §4.1）。
 * `not_found` は物理削除の `MasterDeletionError` と同じコードで、文言も1つ（`MASTER_MESSAGES`）
 */
export type SectionUsecaseError = SectionError | "not_found";

/**
 * 対象の存在確認。**repo ではなく取得済みの一覧から引く**——この画面のユースケースは
 * 検証（重複・最低1件）のために `listAll()` の結果をすでに持っており、二度読む理由がない
 */
function findSection(all: readonly Section[], id: SectionId): Section | null {
  return all.find((s) => s.id === id) ?? null;
}

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
): Promise<Result<SectionId, SectionUsecaseError>> {
  const all = await repo.listAll();
  const validated = validateSectionInput(input, all, id);
  if (!validated.ok) return validated;
  if (findSection(all, id) === null) return err("not_found");
  await repo.update(id, validated.value);
  return ok(id);
}

export async function archiveSection(
  repo: SectionRepository,
  id: SectionId
): Promise<Result<SectionId, SectionUsecaseError>> {
  const all = await repo.listAll();
  // 存在検査は canArchive より先。逆にすると、消えた対象に対して canArchive が
  // 「有効セクションが残るか」だけを見て last_active_section を返し、見当違いの文言が出る
  if (findSection(all, id) === null) return err("not_found");
  const allowed = canArchive(all, id);
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
): Promise<Result<SectionId, SectionUsecaseError>> {
  const target = findSection(await repo.listAll(), id);
  if (target === null) return err("not_found");
  // アーカイブ済みは日界にできない（画面定義書03 §3.1: アーカイブ済み一覧にラジオを置かない）。
  // **対象自体は在る**ので不在の失敗ではなく、UI から到達しない経路として何もせず成功を返す
  if (target.isArchived) return ok(id);
  await repo.setDayStart(id);
  return ok(id);
}

/** 復元は有効セクションへの復帰なので、開始時刻の重複検査が要る */
export async function restoreSection(
  repo: SectionRepository,
  id: SectionId
): Promise<Result<SectionId, SectionUsecaseError>> {
  const all = await repo.listAll();
  const target = findSection(all, id);
  if (target === null) return err("not_found");

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
  const target = findSection(await repo.listAll(), id);
  const counts = await repo.referenceCounts([id]);

  const deletable = canDeleteMaster(target, counts[id] ?? 0);
  if (!deletable.ok) return deletable;

  await repo.remove(id);
  return ok(id);
}
