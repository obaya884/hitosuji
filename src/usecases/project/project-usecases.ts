// プロジェクト管理のユースケース（S-03 / 画面定義書03 §3.3）
import type { ProjectRepository } from "@/usecases/ports/project-repository";
import {
  validateProjectInput,
  type Project,
  type ProjectError,
  type ProjectId,
} from "@/domain/project/project";
import {
  canDeleteMaster,
  deletableMasterIds,
  type MasterDeletionError,
} from "@/domain/shared/master-deletion";
import { sortByName } from "@/domain/shared/name-order";
import { ok, type Result } from "@/domain/shared/result";

export type ProjectListView = Readonly<{
  active: readonly Project[];
  archived: readonly Project[];
  /** 物理削除できる（参照0件の）アーカイブ済みプロジェクトの id（画面定義書03 §4.1） */
  deletableIds: readonly ProjectId[];
}>;

export async function listProjects(repo: ProjectRepository): Promise<ProjectListView> {
  const all = sortByName(await repo.listAll());
  const archived = all.filter((p) => p.isArchived);
  const counts =
    archived.length === 0 ? {} : await repo.referenceCounts(archived.map((p) => p.id));

  return {
    active: all.filter((p) => !p.isArchived),
    archived,
    deletableIds: deletableMasterIds(archived, counts),
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

/**
 * 物理削除（画面定義書03 §4.1）。
 * ボタン表示後に参照が生まれている可能性があるため、削除直前にサーバ側で再チェックする
 */
export async function deleteProject(
  repo: ProjectRepository,
  id: ProjectId
): Promise<Result<ProjectId, MasterDeletionError>> {
  const target = (await repo.listAll()).find((p) => p.id === id) ?? null;
  const counts = await repo.referenceCounts([id]);

  const deletable = canDeleteMaster(target, counts[id] ?? 0);
  if (!deletable.ok) return deletable;

  await repo.remove(id);
  return ok(id);
}
