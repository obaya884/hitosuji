"use server";

import { revalidatePath } from "next/cache";
import {
  archiveSection,
  createSection,
  restoreSection,
  updateSection,
} from "@/application/section/section-usecases";
import type { SectionId } from "@/domain/section/section";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { failure, type ActionResult } from "../_lib/action-result";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const repo = createSectionRepository();
const PATH = "/masters/sections";

export async function createSectionAction(
  input: Readonly<{ name: string; startTime: string }>
): Promise<ActionResult> {
  const result = await createSection(repo, input);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateSectionAction(
  id: SectionId,
  input: Readonly<{ name: string; startTime: string }>
): Promise<ActionResult> {
  const result = await updateSection(repo, id, input);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}

export async function archiveSectionAction(id: SectionId): Promise<ActionResult> {
  const result = await archiveSection(repo, id);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}

export async function restoreSectionAction(id: SectionId): Promise<ActionResult> {
  const result = await restoreSection(repo, id);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}
