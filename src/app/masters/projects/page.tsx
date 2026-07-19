import { listProjects } from "@/application/project/project-usecases";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { ProjectsTable } from "./projects-table";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const view = await listProjects(createProjectRepository());
  return <ProjectsTable active={[...view.active]} archived={[...view.archived]} />;
}
