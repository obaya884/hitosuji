import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  DuplicateAndStartCommand,
  MoveCommand,
  NewTask,
  Relocations,
  Renumber,
  RoutineSkip,
  StartCommand,
  SuspendCommand,
  TaskRepository,
} from "@/usecases/ports/task-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { routineSkips, tasks } from "@/infrastructure/db/schema";

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

/** 自動セクション移動をまとめて適用する（F-113 / データモデル定義書 §4.4） */
async function applyRelocations(
  tx: Pick<Database, "update">,
  relocations: Relocations | null | undefined
): Promise<void> {
  if (relocations === undefined || relocations === null) return;
  const now = new Date();
  for (const row of relocations) {
    await tx
      .update(tasks)
      .set({ sectionId: row.sectionId, sortOrder: row.sortOrder, updatedAt: now })
      .where(eq(tasks.id, row.taskId));
  }
}

/**
 * 打刻列の書き込み（修正 F-203 §4.2-c / 開始の取り消し F-210 §4.5 / 完了の取り消し F-212 §4.7）。
 * 渡された列だけを更新し、伴う並べ直し・戻し位置があれば同一トランザクションで反映する
 */
async function writePunch(
  db: Database,
  id: TaskId,
  punch: Readonly<Partial<Pick<Task, "startedAt" | "endedAt">>>,
  relocation: Relocations | null | undefined
): Promise<void> {
  const now = new Date();
  if (relocation === undefined || relocation === null || relocation.length === 0) {
    await db.update(tasks).set({ ...punch, updatedAt: now }).where(eq(tasks.id, id));
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ ...punch, updatedAt: now }).where(eq(tasks.id, id));
    await applyRelocations(tx, relocation);
  });
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
      const { taskId, startedAt, interruption, relocation } = command;
      const hasRelocation = relocation !== undefined && relocation !== null && relocation.length > 0;

      if (interruption === null && !hasRelocation) {
        await db
          .update(tasks)
          .set({ startedAt, updatedAt: new Date() })
          .where(eq(tasks.id, taskId));
        return;
      }

      if (interruption === null) {
        // 自動セクション移動（F-113 §4.2-a）は打刻と同一トランザクションで反映する
        await db.transaction(async (tx) => {
          const now = new Date();
          await applyRelocations(tx, relocation);
          await tx.update(tasks).set({ startedAt, updatedAt: now }).where(eq(tasks.id, taskId));
        });
        return;
      }

      await db.transaction(async (tx) => {
        const now = new Date();
        await applyRenumber(tx, interruption.renumber);
        await applyRelocations(tx, relocation);
        await tx
          .update(tasks)
          .set({ endedAt: interruption.endedAt, updatedAt: now })
          .where(eq(tasks.id, interruption.runningTaskId));
        await tx.insert(tasks).values(interruption.resumeTask);
        await tx.update(tasks).set({ startedAt, updatedAt: now }).where(eq(tasks.id, taskId));
      });
    },

    // 打刻の修正と、それに伴うセクション移動（§4.2-c）・完了への復帰（§4.7）を1トランザクションで反映する
    async updatePunch(
      id: TaskId,
      punch: Readonly<{ startedAt: Date; endedAt: Date | null }>,
      relocation?: Relocations | null
    ) {
      await writePunch(db, id, punch, relocation);
    },

    async finish(id: TaskId, endedAt: Date) {
      await db.update(tasks).set({ endedAt, updatedAt: new Date() }).where(eq(tasks.id, id));
    },

    // 開始打刻の取り消し（F-210 / データモデル定義書 §4.5）。started_at だけを null に戻す
    async undoStart(id: TaskId, relocation?: Relocations | null) {
      await writePunch(db, id, { startedAt: null }, relocation);
    },

    // 完了の取り消し（F-212 / データモデル定義書 §4.7）。started_at・ended_at をともに null に戻す
    async undoComplete(id: TaskId, relocation?: Relocations | null) {
      await writePunch(db, id, { startedAt: null, endedAt: null }, relocation);
    },

    // 複製して開始は「（割り込みなら）終了 → 再開タスク生成 → 複製タスクを開始済みで生成」を
    // 1トランザクションで行う（F-208 / データモデル定義書 §4.6）
    async duplicateAndStart(command: DuplicateAndStartCommand) {
      const { newTask, startedAt, interruption } = command;

      if (interruption === null) {
        const [row] = await db.insert(tasks).values({ ...newTask, startedAt }).returning();
        return toDomain(row);
      }

      return await db.transaction(async (tx) => {
        const now = new Date();
        await tx
          .update(tasks)
          .set({ endedAt: interruption.endedAt, updatedAt: now })
          .where(eq(tasks.id, interruption.runningTaskId));
        const [row] = await tx.insert(tasks).values({ ...newTask, startedAt }).returning();
        await tx.insert(tasks).values(interruption.resumeTask);
        return toDomain(row);
      });
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

    // ルーチン由来のタスクは削除とスキップ記録を1トランザクションで行う（F-304）
    async delete(id: TaskId, skip: RoutineSkip | null) {
      if (skip === null) {
        await db.delete(tasks).where(eq(tasks.id, id));
        return;
      }

      await db.transaction(async (tx) => {
        await tx.delete(tasks).where(eq(tasks.id, id));
        // 同じ日に何度削除しても記録は1件（uq_routine_skips）
        await tx.insert(routineSkips).values(skip).onConflictDoNothing();
      });
    },

    async restore(restored: Omit<Task, "id">, skip: RoutineSkip | null) {
      if (skip === null) {
        const [row] = await db.insert(tasks).values(restored).returning();
        return toDomain(row);
      }

      // 復元するならスキップも解除する（解除しないと次の表示で重複展開を試みる）
      return await db.transaction(async (tx) => {
        await tx
          .delete(routineSkips)
          .where(
            and(
              eq(routineSkips.routineId, skip.routineId),
              eq(routineSkips.taskDate, skip.taskDate)
            )
          );
        const [row] = await tx.insert(tasks).values(restored).returning();
        return toDomain(row);
      });
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

    async relocate(relocations: Relocations) {
      if (relocations.length === 0) return;
      // 途中まで移動した状態を残さない（データモデル定義書 §4.4）
      await db.transaction(async (tx) => {
        await applyRelocations(tx, relocations);
      });
    },
  };
}
