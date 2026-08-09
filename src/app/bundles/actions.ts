"use server";

import { revalidatePath } from "next/cache";
import {
  createBundle,
  deleteBundle,
  setBundleArchived,
  updateBundle,
} from "@/usecases/bundle/bundle-usecases";
import {
  addRoutineToBundle,
  removeRoutineFromBundle,
  setRoutineScheduledStartTime,
} from "@/usecases/routine/routine-usecases";
import type { BundleId } from "@/domain/bundle/bundle";
import type { RoutineId } from "@/domain/routine/routine";
import { createBundleRepository } from "@/infrastructure/db/repositories/drizzle-bundle-repository";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { failure, type ActionResult, type FailedActionResult } from "@/app/_lib/action-result";
import { BUNDLE_MEMBER_MESSAGES, MASTER_MESSAGES } from "@/app/_lib/error-messages";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
// 各アクションの形は同書 §4「Server Action の形」（早期 return にしない）
const repo = createBundleRepository();
const routineRepo = createRoutineRepository();
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

/** メンバーの追加（画面定義書05 §4 O-5） */
export async function setRoutineBundleAction(
  routineId: RoutineId,
  bundleId: BundleId
): Promise<ActionResult> {
  const result = await addRoutineToBundle(routineRepo, routineId, bundleId);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(BUNDLE_MEMBER_MESSAGES[result.error]);
  }
}

/** メンバーを外す（画面定義書05 §4 O-6） */
export async function removeRoutineFromBundleAction(routineId: RoutineId): Promise<ActionResult> {
  const result = await removeRoutineFromBundle(routineRepo, routineId);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(BUNDLE_MEMBER_MESSAGES[result.error]);
  }
}

/** 開始想定時刻の編集（画面定義書05 §4 O-7） */
export async function setRoutineScheduledStartTimeAction(
  routineId: RoutineId,
  scheduledStartTime: string
): Promise<ActionResult> {
  const result = await setRoutineScheduledStartTime(routineRepo, routineId, scheduledStartTime);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(BUNDLE_MEMBER_MESSAGES[result.error]);
  }
}
