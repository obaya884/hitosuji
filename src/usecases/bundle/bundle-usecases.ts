// バンドル管理のユースケース（S-05 / 画面定義書05）
import type { BundleRepository } from "@/usecases/ports/bundle-repository";
import {
  validateBundleInput,
  type Bundle,
  type BundleError,
  type BundleId,
} from "@/domain/bundle/bundle";
import {
  canDeleteMaster,
  deletableMasterIds,
  type MasterDeletionError,
} from "@/domain/shared/master-deletion";
import { sortByName } from "@/domain/shared/name-order";
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * 更新・アーカイブ切替で起こりうる失敗。入力検証（`BundleError`）に加えて、
 * **対象がすでに存在しない**場合を含む（画面定義書00_共通 §4.1）。
 * `not_found` は物理削除の `MasterDeletionError` と同じコードで、文言も1つ（`MASTER_MESSAGES`）
 */
export type BundleUsecaseError = BundleError | "not_found";

/** 対象の存在確認。Port は findById を持たないので一覧から引く（削除時の再チェックと同じ形） */
async function findBundle(repo: BundleRepository, id: BundleId): Promise<Bundle | null> {
  return (await repo.listAll()).find((b) => b.id === id) ?? null;
}

export type BundleListView = Readonly<{
  active: readonly Bundle[];
  archived: readonly Bundle[];
  /** 物理削除できる（参照0件の）アーカイブ済みバンドルの id（画面定義書05 §5） */
  deletableIds: readonly BundleId[];
}>;

export async function listBundles(repo: BundleRepository): Promise<BundleListView> {
  const all = sortByName(await repo.listAll());
  const archived = all.filter((b) => b.isArchived);
  const counts =
    archived.length === 0 ? {} : await repo.referenceCounts(archived.map((b) => b.id));

  return {
    active: all.filter((b) => !b.isArchived),
    archived,
    deletableIds: deletableMasterIds(archived, counts),
  };
}

export async function createBundle(
  repo: BundleRepository,
  input: Readonly<{ name: string; color: string }>
): Promise<Result<Bundle, BundleError>> {
  const validated = validateBundleInput(input);
  if (!validated.ok) return validated;
  return ok(await repo.create(validated.value));
}

export async function updateBundle(
  repo: BundleRepository,
  id: BundleId,
  input: Readonly<{ name: string; color: string }>
): Promise<Result<BundleId, BundleUsecaseError>> {
  const validated = validateBundleInput(input);
  if (!validated.ok) return validated;
  if ((await findBundle(repo, id)) === null) return err("not_found");
  await repo.update(id, validated.value);
  return ok(id);
}

export async function setBundleArchived(
  repo: BundleRepository,
  id: BundleId,
  isArchived: boolean
): Promise<Result<BundleId, BundleUsecaseError>> {
  if ((await findBundle(repo, id)) === null) return err("not_found");
  await repo.setArchived(id, isArchived);
  return ok(id);
}

/**
 * 物理削除（画面定義書05 §5）。
 * ボタン表示後に参照が生まれている可能性があるため、削除直前にサーバ側で再チェックする
 */
export async function deleteBundle(
  repo: BundleRepository,
  id: BundleId
): Promise<Result<BundleId, MasterDeletionError>> {
  const target = await findBundle(repo, id);
  const counts = await repo.referenceCounts([id]);

  const deletable = canDeleteMaster(target, counts[id] ?? 0);
  if (!deletable.ok) return deletable;

  await repo.remove(id);
  return ok(id);
}
