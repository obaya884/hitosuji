import type { Project, ProjectId } from "@/domain/project/project";

export type ProjectInput = Readonly<{ name: string }>;

export type ProjectRepository = Readonly<{
  listAll(): Promise<Project[]>;
  create(input: ProjectInput): Promise<Project>;
  update(id: ProjectId, input: ProjectInput): Promise<void>;
  setArchived(id: ProjectId, isArchived: boolean): Promise<void>;
}>;
