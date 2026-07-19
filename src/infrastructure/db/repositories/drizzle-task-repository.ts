import { eq } from "drizzle-orm";
import type { NewTask, TaskRepository } from "@/application/ports/task-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { tasks } from "@/infrastructure/db/schema";

type Row = typeof tasks.$inferSelect;

function toDomain(row: Row): Task {
  return {
    id: row.id,
    taskDate: row.taskDate,
    name: row.name,
    estimateMinutes: row.estimateMinutes,
    sectionId: row.sectionId,
    modeId: row.modeId,
    projectId: row.projectId,
    sortOrder: row.sortOrder,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    comment: row.comment,
    routineId: row.routineId,
    splitParentId: row.splitParentId,
    postponedCount: row.postponedCount,
  };
}

export function createTaskRepository(db: Database = defaultDb): TaskRepository {
  return {
    async listByDate(date: LogicalDate) {
      const rows = await db.select().from(tasks).where(eq(tasks.taskDate, date));
      return rows.map(toDomain);
    },

    async create(input: NewTask) {
      const [row] = await db.insert(tasks).values(input).returning();
      return toDomain(row);
    },

    async rename(id: TaskId, name: string) {
      await db.update(tasks).set({ name, updatedAt: new Date() }).where(eq(tasks.id, id));
    },

    async updateEstimate(id: TaskId, estimateMinutes: number) {
      await db
        .update(tasks)
        .set({ estimateMinutes, updatedAt: new Date() })
        .where(eq(tasks.id, id));
    },
  };
}
