import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  MoveCommand,
  NewTask,
  Renumber,
  StartCommand,
  SuspendCommand,
  TaskRepository,
} from "@/application/ports/task-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { tasks } from "@/infrastructure/db/schema";

type Row = typeof tasks.$inferSelect;

/** 振り直しをまとめて適用する（呼び出し側のトランザクション内で使う） */
async function applyRenumber(
  tx: Pick<Database, "update">,
  renumber: Renumber | null | undefined
): Promise<void> {
  if (renumber === undefined || renumber === null) return;
  const now = new Date();
  for (const row of renumber) {
    await tx.update(tasks).set({ sortOrder: row.sortOrder, updatedAt: now }).where(eq(tasks.id, row.taskId));
  }
}

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

    async create(input: NewTask, renumber?: Renumber | null) {
      if (renumber === undefined || renumber === null) {
        const [row] = await db.insert(tasks).values(input).returning();
        return toDomain(row);
      }

      // 振り直しと挿入は同じトランザクションで反映する（データモデル定義書 §3.5）
      return await db.transaction(async (tx) => {
        await applyRenumber(tx, renumber);
        const [row] = await tx.insert(tasks).values(input).returning();
        return toDomain(row);
      });
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
        await applyRenumber(tx, interruption.renumber);
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

    // 中断は「終了 → 再開タスク生成」を1トランザクションで行う（データモデル定義書 §4.2）
    async suspend(command: SuspendCommand) {
      await db.transaction(async (tx) => {
        const now = new Date();
        await applyRenumber(tx, command.renumber);
        await tx
          .update(tasks)
          .set({ endedAt: command.endedAt, updatedAt: now })
          .where(eq(tasks.id, command.taskId));
        await tx.insert(tasks).values(command.resumeTask);
      });
    },

    async delete(id: TaskId) {
      await db.delete(tasks).where(eq(tasks.id, id));
    },

    async restore(restored: Omit<Task, "id">) {
      const [row] = await db.insert(tasks).values(restored).returning();
      return toDomain(row);
    },

    async postpone(id: TaskId, input: Readonly<{ taskDate: LogicalDate; sortOrder: number }>) {
      await db
        .update(tasks)
        .set({
          taskDate: input.taskDate,
          sortOrder: input.sortOrder,
          postponedCount: sql`${tasks.postponedCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, id));
    },

    async updateClassification(
      id: TaskId,
      classification: Readonly<{ modeId?: number | null; projectId?: number | null }>
    ) {
      await db
        .update(tasks)
        .set({ ...classification, updatedAt: new Date() })
        .where(eq(tasks.id, id));
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
        await applyRenumber(tx, renumber);
        await tx
          .update(tasks)
          .set({ sectionId, sortOrder, updatedAt: now })
          .where(eq(tasks.id, taskId));
      });
    },
  };
}
