"use server";

import { revalidatePath } from "next/cache";
import {
  createProject,
  setProjectArchived,
  updateProject,
} from "@/usecases/project/project-usecases";
import type { ProjectId } from "@/domain/project/project";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { failure, type ActionResult } from "../_lib/action-result";

const repo = createProjectRepository();
const PATH = "/masters/projects";

export async function createProjectAction(
  input: Readonly<{ name: string }>
): Promise<ActionResult> {
  const result = await createProject(repo, input);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateProjectAction(
  id: ProjectId,
  input: Readonly<{ name: string }>
): Promise<ActionResult> {
  const result = await updateProject(repo, id, input);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}

export async function setProjectArchivedAction(
  id: ProjectId,
  isArchived: boolean
): Promise<ActionResult> {
  const result = await setProjectArchived(repo, id, isArchived);
  if (!result.ok) return failure(result.error);
  revalidatePath(PATH);
  return { ok: true };
}
