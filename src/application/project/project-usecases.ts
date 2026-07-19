// プロジェクト管理のユースケース（S-03 / 画面定義書03 §3.3）
import type { ProjectRepository } from "@/application/ports/project-repository";
import {
  validateProjectInput,
  type Project,
  type ProjectError,
  type ProjectId,
} from "@/domain/project/project";
import { sortByName } from "@/domain/shared/name-order";
import { ok, type Result } from "@/domain/shared/result";

export type ProjectListView = Readonly<{
  active: readonly Project[];
  archived: readonly Project[];
}>;

export async function listProjects(repo: ProjectRepository): Promise<ProjectListView> {
  const all = sortByName(await repo.listAll());
  return {
    active: all.filter((p) => !p.isArchived),
    archived: all.filter((p) => p.isArchived),
  };
}

export async function createProject(
  repo: ProjectRepository,
  input: Readonly<{ name: string }>
): Promise<Result<Project, ProjectError>> {
  const validated = validateProjectInput(input);
  if (!validated.ok) return validated;
  return ok(await repo.create(validated.value));
}

export async function updateProject(
  repo: ProjectRepository,
  id: ProjectId,
  input: Readonly<{ name: string }>
): Promise<Result<ProjectId, ProjectError>> {
  const validated = validateProjectInput(input);
  if (!validated.ok) return validated;
  await repo.update(id, validated.value);
  return ok(id);
}

export async function setProjectArchived(
  repo: ProjectRepository,
  id: ProjectId,
  isArchived: boolean
): Promise<Result<ProjectId, ProjectError>> {
  await repo.setArchived(id, isArchived);
  return ok(id);
}
