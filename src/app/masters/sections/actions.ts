"use server";

import { revalidatePath } from "next/cache";
import {
  archiveSection,
  createSection,
  deleteSection,
  restoreSection,
  setDayStartSection,
  updateSection,
} from "@/usecases/section/section-usecases";
import type { SectionId } from "@/domain/section/section";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { failure, type ActionResult } from "@/app/_lib/action-result";
import { MASTER_MESSAGES } from "@/app/_lib/error-messages";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
// 各アクションの形は同書 §4「Server Action の形」（早期 return にしない）
const repo = createSectionRepository();
const PATH = "/masters/sections";

export async function createSectionAction(
  input: Readonly<{ name: string; startTime: string }>
): Promise<ActionResult> {
  const result = await createSection(repo, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function updateSectionAction(
  id: SectionId,
  input: Readonly<{ name: string; startTime: string }>
): Promise<ActionResult> {
  const result = await updateSection(repo, id, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function archiveSectionAction(id: SectionId): Promise<ActionResult> {
  const result = await archiveSection(repo, id);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

/** 日界セクション（1日の開始。F-116）を切り替える（画面定義書03 §3.1） */
export async function setDayStartSectionAction(id: SectionId): Promise<ActionResult> {
  const result = await setDayStartSection(repo, id);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function restoreSectionAction(id: SectionId): Promise<ActionResult> {
  const result = await restoreSection(repo, id);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

/** 物理削除（画面定義書03 §4.1。アーカイブ済み・参照0件のみ） */
export async function deleteSectionAction(id: SectionId): Promise<ActionResult> {
  const result = await deleteSection(repo, id);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}
