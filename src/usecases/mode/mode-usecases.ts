// モード管理のユースケース（S-03 / 画面定義書03 §3.2）
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import { validateModeInput, type Mode, type ModeError, type ModeId } from "@/domain/mode/mode";
import {
  canDeleteMaster,
  deletableMasterIds,
  type MasterDeletionError,
} from "@/domain/shared/master-deletion";
import { sortByName } from "@/domain/shared/name-order";
import { ok, type Result } from "@/domain/shared/result";

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
): Promise<Result<ModeId, ModeError>> {
  const validated = validateModeInput(input);
  if (!validated.ok) return validated;
  await repo.update(id, validated.value);
  return ok(id);
}

export async function setModeArchived(
  repo: ModeRepository,
  id: ModeId,
  isArchived: boolean
): Promise<Result<ModeId, ModeError>> {
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
  const target = (await repo.listAll()).find((m) => m.id === id) ?? null;
  const counts = await repo.referenceCounts([id]);

  const deletable = canDeleteMaster(target, counts[id] ?? 0);
  if (!deletable.ok) return deletable;

  await repo.remove(id);
  return ok(id);
}
