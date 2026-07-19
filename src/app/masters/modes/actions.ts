"use server";

import { revalidatePath } from "next/cache";
import { createMode, setModeArchived, updateMode } from "@/usecases/mode/mode-usecases";
import type { ModeId } from "@/domain/mode/mode";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { failure, type ActionResult } from "../_lib/action-result";

const repo = createModeRepository();
const PATH = "/masters/modes";

export async function createModeAction(
  input: Readonly<{ name: string; color: string }>
): Promise<ActionResult> {
  const result = await createMode(repo, input);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateModeAction(
  id: ModeId,
  input: Readonly<{ name: string; color: string }>
): Promise<ActionResult> {
  const result = await updateMode(repo, id, input);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}

export async function setModeArchivedAction(
  id: ModeId,
  isArchived: boolean
): Promise<ActionResult> {
  const result = await setModeArchived(repo, id, isArchived);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}
