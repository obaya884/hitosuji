import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type {
  MoveCommand,
  NewTask,
  StartCommand,
  TaskRepository,
} from "@/application/ports/task-repository";
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

    async findById(id: TaskId) {
      const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
      return row === undefined ? null : toDomain(row);
    },

    async findRunning() {
      const [row] = await db
        .select()
        .from(tasks)
        .where(and(isNotNull(tasks.startedAt), isNull(tasks.endedAt)));
      return row === undefined ? null : toDomain(row);
    },

    // 割り込みは「終了 → 再開タスク生成 → 開始」を1トランザクションで行う（アーキテクチャ定義書 §7）
    async start(command: StartCommand) {
      const { taskId, startedAt, interruption } = command;
      if (interruption === null) {
        await db
          .update(tasks)
          .set({ startedAt, updatedAt: new Date() })
          .where(eq(tasks.id, taskId));
        return;
      }

      await db.transaction(async (tx) => {
        const now = new Date();
        await tx
          .update(tasks)
          .set({ endedAt: interruption.endedAt, updatedAt: now })
          .where(eq(tasks.id, interruption.runningTaskId));
        await tx.insert(tasks).values(interruption.resumeTask);
        await tx.update(tasks).set({ startedAt, updatedAt: now }).where(eq(tasks.id, taskId));
      });
    },

    async updatePunch(id: TaskId, punch: Readonly<{ startedAt: Date; endedAt: Date | null }>) {
      await db
        .update(tasks)
        .set({ ...punch, updatedAt: new Date() })
        .where(eq(tasks.id, id));
    },

    async finish(id: TaskId, endedAt: Date) {
      await db.update(tasks).set({ endedAt, updatedAt: new Date() }).where(eq(tasks.id, id));
    },

    // 振り直しを伴う場合も含め、並びの更新は1トランザクションで反映する
    async move(command: MoveCommand) {
      const { taskId, sectionId, sortOrder, renumber } = command;
      const now = new Date();

      if (renumber === null) {
        await db
          .update(tasks)
          .set({ sectionId, sortOrder, updatedAt: now })
          .where(eq(tasks.id, taskId));
        return;
      }

      await db.transaction(async (tx) => {
        for (const row of renumber) {
          await tx
            .update(tasks)
            .set({ sortOrder: row.sortOrder, updatedAt: now })
            .where(eq(tasks.id, row.taskId));
        }
        await tx
          .update(tasks)
          .set({ sectionId, sortOrder, updatedAt: now })
          .where(eq(tasks.id, taskId));
      });
    },
  };
}
