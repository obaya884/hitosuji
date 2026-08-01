// モード管理のユースケース（S-03 / 画面定義書03 §3.2）
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import { validateModeInput, type Mode, type ModeError, type ModeId } from "@/domain/mode/mode";
import {
  canDeleteMaster,
  deletableMasterIds,
  type MasterDeletionError,
} from "@/domain/shared/master-deletion";
import { sortByName } from "@/domain/shared/name-order";
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * 更新・アーカイブ切替で起こりうる失敗。入力検証（`ModeError`）に加えて、
 * **対象がすでに存在しない**場合を含む（画面定義書00_共通 §4.1）。
 * `not_found` は物理削除の `MasterDeletionError` と同じコードで、文言も1つ（`MASTER_MESSAGES`）
 */
export type ModeUsecaseError = ModeError | "not_found";

/** 対象の存在確認。Port は findById を持たないので一覧から引く（削除時の再チェックと同じ形） */
async function findMode(repo: ModeRepository, id: ModeId): Promise<Mode | null> {
  return (await repo.listAll()).find((m) => m.id === id) ?? null;
}

export type ModeListView = Readonly<{
  active: readonly Mode[];
  archived: readonly Mode[];
  /** 物理削除できる（参照0件の）アーカイブ済みモードの id（画面定義書03 §4.1） */
  deletableIds: readonly ModeId[];
}>;

export async function listModes(repo: ModeRepository): Promise<ModeListView> {
  const all = sortByName(await repo.listAll());
  const archived = all.filter((m) => m.isArchived);
  const counts =
    archived.length === 0 ? {} : await repo.referenceCounts(archived.map((m) => m.id));

  return {
    active: all.filter((m) => !m.isArchived),
    archived,
    deletableIds: deletableMasterIds(archived, counts),
  };
}

export async function createMode(
  repo: ModeRepository,
  input: Readonly<{ name: string; color: string }>
): Promise<Result<Mode, ModeError>> {
  const validated = validateModeInput(input);
  if (!validated.ok) return validated;
  return ok(await repo.create(validated.value));
}

export async function updateMode(
  repo: ModeRepository,
  id: ModeId,
  input: Readonly<{ name: string; color: string }>
): Promise<Result<ModeId, ModeUsecaseError>> {
  const validated = validateModeInput(input);
  if (!validated.ok) return validated;
  if ((await findMode(repo, id)) === null) return err("not_found");
  await repo.update(id, validated.value);
  return ok(id);
}

export async function setModeArchived(
  repo: ModeRepository,
  id: ModeId,
  isArchived: boolean
): Promise<Result<ModeId, ModeUsecaseError>> {
  if ((await findMode(repo, id)) === null) return err("not_found");
  await repo.setArchived(id, isArchived);
  return ok(id);
}

/**
 * 物理削除（画面定義書03 §4.1）。
 * ボタン表示後に参照が生まれている可能性があるため、削除直前にサーバ側で再チェックする
 */
export async function deleteMode(
  repo: ModeRepository,
  id: ModeId
): Promise<Result<ModeId, MasterDeletionError>> {
  const target = await findMode(repo, id);
  const counts = await repo.referenceCounts([id]);

  const deletable = canDeleteMaster(target, counts[id] ?? 0);
  if (!deletable.ok) return deletable;

  await repo.remove(id);
  return ok(id);
}
