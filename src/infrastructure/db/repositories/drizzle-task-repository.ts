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
import type { ModeId } from "@/domain/mode/mode";
import type { ProjectId } from "@/domain/project/project";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { routineSkips, tasks } from "@/infrastructure/db/schema";

type Row = typeof tasks.$inferSelect;

/** 振り直しをまとめて適用する（呼び出し側のトランザクション内で使う） */
async function applyRenumber(tx: Pick<Database, "update">, renumber: Renumber): Promise<void> {
  const now = new Date();
  for (const row of renumber) {
    await tx.update(tasks).set({ sortOrder: row.sortOrder, updatedAt: now }).where(eq(tasks.id, row.taskId));
  }
}

/** 自動セクション移動をまとめて適用する（F-113 / データモデル定義書 §4.4） */
async function applyRelocations(tx: Pick<Database, "update">, relocations: Relocations): Promise<void> {
  const now = new Date();
  for (const row of relocations) {
    await tx
      .update(tasks)
      .set({ sectionId: row.sectionId, sortOrder: row.sortOrder, updatedAt: now })
      .where(eq(tasks.id, row.taskId));
  }
}

/**
 * 打刻列の書き込み（修正 F-203 / 画面定義書01 §4.2-c、開始の取り消し F-210 / データモデル定義書 §4.5、
 * 完了の取り消し F-212 / 同書 §4.7）。
 * 渡された列だけを更新する。並べ直し・戻し位置を伴うなら、それは打刻と一体の操作なので同時に反映する
 */
async function writePunch(
  db: Database,
  id: TaskId,
  punch: Readonly<Partial<Pick<Task, "startedAt" | "endedAt">>>,
  relocations: Relocations
): Promise<void> {
  const now = new Date();
  // 打刻の書き換えだけで完結する呼び出し（表示日以外の取り消しなど）。書く行が1つなので原子性の相手がいない
  if (relocations.length === 0) {
    await db.update(tasks).set({ ...punch, updatedAt: now }).where(eq(tasks.id, id));
    return;
  }

  // 並べ直しを伴う呼び出し。打刻だけ動いて配置が古いままの状態を見せない
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ ...punch, updatedAt: now }).where(eq(tasks.id, id));
    await applyRelocations(tx, relocations);
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
    bundleId: row.bundleId,
    sortOrder: row.sortOrder,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    comment: row.comment,
    highlighted: row.highlighted,
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

    async create(input: NewTask, renumber: Renumber) {
      // 中間値が空いていた挿入。1行の INSERT で完結する（データモデル定義書 §3.5）
      if (renumber.length === 0) {
        const [row] = await db.insert(tasks).values(input).returning();
        return toDomain(row);
      }

      // 中間値が尽きてグループ全体を振り直す挿入。振り直しの途中の並びを見せない（同書 §3.5）
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

    async updateComment(id: TaskId, comment: string | null) {
      await db.update(tasks).set({ comment, updatedAt: new Date() }).where(eq(tasks.id, id));
    },

    async updateHighlight(id: TaskId, highlighted: boolean) {
      await db.update(tasks).set({ highlighted, updatedAt: new Date() }).where(eq(tasks.id, id));
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

    // 開始打刻（F-201）。実行中タスクの有無と自動セクション移動の有無で、書く行の数が変わる
    async start(command: StartCommand) {
      const { taskId, startedAt, interruption, relocations } = command;

      // 実行中タスクが無く、セクションもまたがない開始。started_at 1列で完結する
      if (interruption === null && relocations.length === 0) {
        await db
          .update(tasks)
          .set({ startedAt, updatedAt: new Date() })
          .where(eq(tasks.id, taskId));
        return;
      }

      if (interruption === null) {
        // 自動セクション移動（F-113 / 画面定義書01 §4.2-a）を伴う開始。
        // 移動先へ移りきる前の位置で開始済みに見える瞬間を作らない
        await db.transaction(async (tx) => {
          const now = new Date();
          await applyRelocations(tx, relocations);
          await tx.update(tasks).set({ startedAt, updatedAt: now }).where(eq(tasks.id, taskId));
        });
        return;
      }

      // 割り込み（要件定義書 §5.2 F-201）。「実行中を終了 → 再開タスク生成 → 開始」は**操作として不可分**で、
      // 途中で切れると実行中が0件や2件になる（実行中は全体で最大1件）
      await db.transaction(async (tx) => {
        const now = new Date();
        // 移動 → 振り直しの順に当てる。再開タスクの位置と振り直しは
        // 移動後の並びから計算されている（punch-usecases の startTask）ので、逆順だと移動が振り直しを上書きする
        await applyRelocations(tx, relocations);
        await applyRenumber(tx, interruption.renumber);
        await tx
          .update(tasks)
          .set({ endedAt: interruption.endedAt, updatedAt: now })
          .where(eq(tasks.id, interruption.runningTaskId));
        await tx.insert(tasks).values(interruption.resumeTask);
        await tx.update(tasks).set({ startedAt, updatedAt: now }).where(eq(tasks.id, taskId));
      });
    },

    // 打刻の修正と、それに伴うセクション移動（画面定義書01 §4.2-c）・完了への復帰（データモデル定義書 §4.7）
    async updatePunch(
      id: TaskId,
      punch: Readonly<{ startedAt: Date; endedAt: Date | null }>,
      relocations: Relocations
    ) {
      await writePunch(db, id, punch, relocations);
    },

    async finish(id: TaskId, endedAt: Date) {
      await db.update(tasks).set({ endedAt, updatedAt: new Date() }).where(eq(tasks.id, id));
    },

    // 開始打刻の取り消し（F-210 / データモデル定義書 §4.5）。started_at だけを null に戻す
    async undoStart(id: TaskId, relocations: Relocations) {
      await writePunch(db, id, { startedAt: null }, relocations);
    },

    // 完了の取り消し（F-212 / データモデル定義書 §4.7）。started_at・ended_at をともに null に戻す
    async undoComplete(id: TaskId, relocations: Relocations) {
      await writePunch(db, id, { startedAt: null, endedAt: null }, relocations);
    },

    // 複製して開始（F-208 / データモデル定義書 §4.6）。割り込みなら終了・再開タスク生成も伴う
    async duplicateAndStart(command: DuplicateAndStartCommand) {
      const { newTask, startedAt, interruption, renumber } = command;

      // 実行中タスクが無く、挿入位置も空いている複製。1行の INSERT で完結する
      if (interruption === null && renumber.length === 0) {
        const [row] = await db.insert(tasks).values({ ...newTask, startedAt }).returning();
        return toDomain(row);
      }

      // 割り込み（要件定義書 §5.2 F-201）を伴うなら実行中の終了と再開タスク生成が、
      // 振り直しを伴うなら挿入位置の確保が、複製の生成と不可分になる
      return await db.transaction(async (tx) => {
        const now = new Date();
        // 振り直しは挿入位置を空ける処理なので、どの INSERT よりも先に当てる（データモデル定義書 §3.5）
        await applyRenumber(tx, renumber);
        if (interruption !== null) {
          await tx
            .update(tasks)
            .set({ endedAt: interruption.endedAt, updatedAt: now })
            .where(eq(tasks.id, interruption.runningTaskId));
        }
        // 複製 → 再開タスクの順に挿入するため、割り込みの分岐は終了ぶんと挿入ぶんに分かれる。
        // 1つに寄せると id の採番順が入れ替わり、偽物（in-memory-repository）と食い違う
        const [row] = await tx.insert(tasks).values({ ...newTask, startedAt }).returning();
        if (interruption !== null) await tx.insert(tasks).values(interruption.resumeTask);
        return toDomain(row);
      });
    },

    // 中断（F-204 / データモデル定義書 §4.2）。付帯更新の有無によらず「実行中を終了 → 再開タスク生成」の
    // 2行を書くので分岐は無い。途中で切れると実行中が消えたまま再開タスクも無い状態が残る
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

    async delete(id: TaskId, skip: RoutineSkip | null) {
      // ルーチン由来でないタスクの削除。消す行は1つだけ
      if (skip === null) {
        await db.delete(tasks).where(eq(tasks.id, id));
        return;
      }

      // ルーチン由来なら削除とスキップ記録が不可分（F-301）。
      // 記録できないまま消えると、次の表示で同じタスクが再展開される
      await db.transaction(async (tx) => {
        await tx.delete(tasks).where(eq(tasks.id, id));
        // 同じ日に何度削除しても記録は1件（uq_routine_skips）
        await tx.insert(routineSkips).values(skip).onConflictDoNothing();
      });
    },

    async restore(restored: Omit<Task, "id">, skip: RoutineSkip | null) {
      // ルーチン由来でないタスクの復元。書く行は1つだけ
      if (skip === null) {
        const [row] = await db.insert(tasks).values(restored).returning();
        return toDomain(row);
      }

      // 復元とスキップの解除が不可分（解除だけ残ると、復元できていないルーチンが次の表示で重複展開される）
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

    async postpone(
      id: TaskId,
      input: Readonly<{ taskDate: LogicalDate; sortOrder: number }>,
      skip: RoutineSkip | null
    ) {
      const moved = {
        taskDate: input.taskDate,
        sortOrder: input.sortOrder,
        routineId: null, // 先送りは紐付けを切って移る（データモデル定義書 §3.5）
        postponedCount: sql`${tasks.postponedCount} + 1`,
        updatedAt: new Date(),
      };

      // ルーチン由来でないタスクの先送り。動く行は1つだけ
      if (skip === null) {
        await db.update(tasks).set(moved).where(eq(tasks.id, id));
        return;
      }

      // ルーチン由来なら移動と元の日のスキップ記録が不可分（§3.6）。
      // 記録できないまま移すと、元の日を再表示した時点で同じタスクが再展開される
      await db.transaction(async (tx) => {
        await tx.update(tasks).set(moved).where(eq(tasks.id, id));
        await tx.insert(routineSkips).values(skip).onConflictDoNothing();
      });
    },

    async updateClassification(
      id: TaskId,
      classification: Readonly<{ modeId?: ModeId | null; projectId?: ProjectId | null }>
    ) {
      await db
        .update(tasks)
        .set({ ...classification, updatedAt: new Date() })
        .where(eq(tasks.id, id));
    },

    async move(command: MoveCommand) {
      const { taskId, sectionId, sortOrder, renumber } = command;
      const now = new Date();

      // 移動先に中間値が空いていた並び替え。動く行は対象1つだけ（データモデル定義書 §3.5）
      if (renumber.length === 0) {
        await db
          .update(tasks)
          .set({ sectionId, sortOrder, updatedAt: now })
          .where(eq(tasks.id, taskId));
        return;
      }

      // 中間値が尽きてグループ全体を振り直す並び替え。振り直しの途中の並びを見せない（同書 §3.5）
      await db.transaction(async (tx) => {
        // 振り直しは移動先を空ける処理なので、本体の更新より先に当てる
        await applyRenumber(tx, renumber);
        await tx
          .update(tasks)
          .set({ sectionId, sortOrder, updatedAt: now })
          .where(eq(tasks.id, taskId));
      });
    },

    async relocate(relocations: Relocations) {
      // 移す行が無い呼び出し（繰り越しの対象が居ない日）。書き込みそのものが起きない
      if (relocations.length === 0) return;
      // 複数行の移動なので、途中まで移動した状態を残さない（データモデル定義書 §4.4）
      await db.transaction(async (tx) => {
        await applyRelocations(tx, relocations);
      });
    },
  };
}
