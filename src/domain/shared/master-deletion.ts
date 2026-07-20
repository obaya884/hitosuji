// マスタの物理削除の可否（画面定義書03 §4.1）。
// 誤作成直後の片付けのための例外手段であり、アーカイブ済み・参照0件の2条件を満たすときだけ許す
import { err, ok, type Result } from "./result";

export type MasterDeletionError = "not_found" | "not_archived" | "has_references";

export function canDeleteMaster(
  master: Readonly<{ isArchived: boolean }> | null,
  referenceCount: number
): Result<true, MasterDeletionError> {
  if (master === null) return err("not_found");
  if (!master.isArchived) return err("not_archived");
  if (referenceCount > 0) return err("has_references");
  return ok(true);
}

/** 一覧で削除ボタンを出す対象（＝アーカイブ済みかつ参照0件）の id */
export function deletableMasterIds<T extends Readonly<{ id: number; isArchived: boolean }>>(
  masters: readonly T[],
  referenceCounts: Readonly<Record<number, number>>
): readonly number[] {
  return masters
    .filter((m) => canDeleteMaster(m, referenceCounts[m.id] ?? 0).ok)
    .map((m) => m.id);
}
