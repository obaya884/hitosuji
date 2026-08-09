"use server";

import { revalidatePath } from "next/cache";
import {
  createBundle,
  deleteBundle,
  setBundleArchived,
  updateBundle,
} from "@/usecases/bundle/bundle-usecases";
import type { BundleId } from "@/domain/bundle/bundle";
import { createBundleRepository } from "@/infrastructure/db/repositories/drizzle-bundle-repository";
import { failure, type ActionResult, type FailedActionResult } from "@/app/_lib/action-result";
import { MASTER_MESSAGES } from "@/app/_lib/error-messages";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
// 各アクションの形は同書 §4「Server Action の形」（早期 return にしない）
const repo = createBundleRepository();
const PATH = "/bundles";

/**
 * 新規作成の結果。**成功時は採番された id を返す**——作成したバンドルを選択状態にする
 * （画面定義書05 §4 O-1）ため、`(daily)` の `CreatingActionResult` と同じ発想
 */
export type CreateBundleActionResult = Readonly<{ ok: true; id: BundleId }> | FailedActionResult;

export async function createBundleAction(
  input: Readonly<{ name: string; color: string }>
): Promise<CreateBundleActionResult> {
  const result = await createBundle(repo, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true, id: result.value.id };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function updateBundleAction(
  id: BundleId,
  input: Readonly<{ name: string; color: string }>
): Promise<ActionResult> {
  const result = await updateBundle(repo, id, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function setBundleArchivedAction(
  id: BundleId,
  isArchived: boolean
): Promise<ActionResult> {
  const result = await setBundleArchived(repo, id, isArchived);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

/** 物理削除（画面定義書05 §5。アーカイブ済み・参照0件のみ） */
export async function deleteBundleAction(id: BundleId): Promise<ActionResult> {
  const result = await deleteBundle(repo, id);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}
