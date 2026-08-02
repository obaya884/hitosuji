"use server";

import { revalidatePath } from "next/cache";
import {
  createProject,
  deleteProject,
  setProjectArchived,
  updateProject,
} from "@/usecases/project/project-usecases";
import type { ProjectId } from "@/domain/project/project";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { failure, type ActionResult } from "@/app/_lib/action-result";
import { MASTER_MESSAGES } from "@/app/_lib/error-messages";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
// 各アクションの形は同書 §4「Server Action の形」（早期 return にしない）
const repo = createProjectRepository();
const PATH = "/masters/projects";

export async function createProjectAction(
  input: Readonly<{ name: string }>
): Promise<ActionResult> {
  const result = await createProject(repo, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function updateProjectAction(
  id: ProjectId,
  input: Readonly<{ name: string }>
): Promise<ActionResult> {
  const result = await updateProject(repo, id, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

export async function setProjectArchivedAction(
  id: ProjectId,
  isArchived: boolean
): Promise<ActionResult> {
  const result = await setProjectArchived(repo, id, isArchived);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}

/** 物理削除（画面定義書03 §4.1。アーカイブ済み・参照0件のみ） */
export async function deleteProjectAction(id: ProjectId): Promise<ActionResult> {
  const result = await deleteProject(repo, id);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(MASTER_MESSAGES[result.error]);
  }
}
