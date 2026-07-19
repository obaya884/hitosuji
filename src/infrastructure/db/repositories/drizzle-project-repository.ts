import { eq } from "drizzle-orm";
import type { ProjectInput, ProjectRepository } from "@/usecases/ports/project-repository";
import type { Project, ProjectId } from "@/domain/project/project";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { projects } from "@/infrastructure/db/schema";

type Row = typeof projects.$inferSelect;

function toDomain(row: Row): Project {
  return { id: row.id, name: row.name, isArchived: row.isArchived };
}

export function createProjectRepository(db: Database = defaultDb): ProjectRepository {
  return {
    async listAll() {
      const rows = await db.select().from(projects);
      return rows.map(toDomain);
    },

    async create(input: ProjectInput) {
      const [row] = await db.insert(projects).values(input).returning();
      return toDomain(row);
    },

    async update(id: ProjectId, input: ProjectInput) {
      await db
        .update(projects)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(projects.id, id));
    },

    async setArchived(id: ProjectId, isArchived: boolean) {
      await db
        .update(projects)
        .set({ isArchived, updatedAt: new Date() })
        .where(eq(projects.id, id));
    },
  };
}
