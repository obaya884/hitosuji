"use server";

import { revalidatePath } from "next/cache";
import {
  createMode,
  deleteMode,
  setModeArchived,
  updateMode,
} from "@/usecases/mode/mode-usecases";
import type { ModeId } from "@/domain/mode/mode";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { failure, type ActionResult } from "@/app/_lib/action-result";
import { MASTER_MESSAGES } from "@/app/_lib/error-messages";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
// 各アクションの形は同書 §4「Server Action の形」（早期 return にしない）
const repo = createModeRepository();
const PATH = "/masters/modes";

export async function createModeAction(
  input: Readonly<{ name: string; color: string }>
): Promise<ActionResult> {
  const result = await createMode(repo, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function updateModeAction(
  id: ModeId,
  input: Readonly<{ name: string; color: string }>
): Promise<ActionResult> {
  const result = await updateMode(repo, id, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function setModeArchivedAction(
  id: ModeId,
  isArchived: boolean
): Promise<ActionResult> {
  const result = await setModeArchived(repo, id, isArchived);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

/** 物理削除（画面定義書03 §4.1。アーカイブ済み・参照0件のみ） */
export async function deleteModeAction(id: ModeId): Promise<ActionResult> {
  const result = await deleteMode(repo, id);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}
