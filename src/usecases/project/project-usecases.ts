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
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * 更新・アーカイブ切替で起こりうる失敗。入力検証（`ProjectError`）に加えて、
 * **対象がすでに存在しない**場合を含む（画面定義書00_共通 §4.1）。
 * `not_found` は物理削除の `MasterDeletionError` と同じコードで、文言も1つ（`MASTER_MESSAGES`）
 */
export type ProjectUsecaseError = ProjectError | "not_found";

/** 対象の存在確認。Port は findById を持たないので一覧から引く（削除時の再チェックと同じ形） */
async function findProject(repo: ProjectRepository, id: ProjectId): Promise<Project | null> {
  return (await repo.listAll()).find((p) => p.id === id) ?? null;
}

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
): Promise<Result<ProjectId, ProjectUsecaseError>> {
  const validated = validateProjectInput(input);
  if (!validated.ok) return validated;
  if ((await findProject(repo, id)) === null) return err("not_found");
  await repo.update(id, validated.value);
  return ok(id);
}

export async function setProjectArchived(
  repo: ProjectRepository,
  id: ProjectId,
  isArchived: boolean
): Promise<Result<ProjectId, ProjectUsecaseError>> {
  if ((await findProject(repo, id)) === null) return err("not_found");
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
  const target = await findProject(repo, id);
  const counts = await repo.referenceCounts([id]);

  const deletable = canDeleteMaster(target, counts[id] ?? 0);
  if (!deletable.ok) return deletable;

  await repo.remove(id);
  return ok(id);
}
