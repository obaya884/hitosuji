import type { Project, ProjectId } from "@/domain/project/project";

export type ProjectInput = Readonly<{ name: string }>;

export type ProjectRepository = Readonly<{
  listAll(): Promise<Project[]>;
  create(input: ProjectInput): Promise<Project>;
  update(id: ProjectId, input: ProjectInput): Promise<void>;
  setArchived(id: ProjectId, isArchived: boolean): Promise<void>;
  /** 各プロジェクトを参照するタスク・ルーチンの件数（画面定義書03 §4.1）。参照0件の id は省略されうる */
  referenceCounts(ids: readonly ProjectId[]): Promise<Readonly<Record<ProjectId, number>>>;
  remove(id: ProjectId): Promise<void>;
}>;
