import { eq, sql } from "drizzle-orm";
import type {
  RoutineRepository,
  RoutineTaskSeed,
} from "@/usecases/ports/routine-repository";
import { normalizeStartTime } from "@/domain/section/section";
import type { RecurrenceType, Routine, RoutineId } from "@/domain/routine/routine";
import type { ValidRoutineInput } from "@/domain/routine/routine-input";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { routineSkips, routines, tasks } from "@/infrastructure/db/schema";

type Row = typeof routines.$inferSelect;

function toDomain(row: Row): Routine {
  return {
    id: row.id,
    name: row.name,
    estimateMinutes: row.estimateMinutes,
    // time 型は "HH:MM:SS" で返るのでドメインの表現（"HH:MM"）へ揃える
    scheduledStartTime: normalizeStartTime(row.scheduledStartTime),
    modeId: row.modeId,
    projectId: row.projectId,
    recurrenceType: row.recurrenceType as RecurrenceType,
    weekdays: row.weekdays,
    monthDay: row.monthDay,
    intervalDays: row.intervalDays,
    startDate: row.startDate,
    endDate: row.endDate,
    isActive: row.isActive,
  };
}

export function createRoutineRepository(db: Database = defaultDb): RoutineRepository {
  return {
    async listAll() {
      const rows = await db.select().from(routines);
      return rows.map(toDomain);
    },

    async findById(id: RoutineId) {
      const [row] = await db.select().from(routines).where(eq(routines.id, id));
      return row === undefined ? null : toDomain(row);
    },

    async create(input: ValidRoutineInput) {
      const [row] = await db.insert(routines).values(input).returning();
      return toDomain(row);
    },

    async update(id: RoutineId, input: ValidRoutineInput) {
      await db
        .update(routines)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(routines.id, id));
    },

    async setActive(id: RoutineId, isActive: boolean) {
      await db
        .update(routines)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(routines.id, id));
    },

    async delete(id: RoutineId) {
      // tasks.routine_id は ON DELETE SET NULL なので展開済みタスクはログとして残る
      await db.delete(routines).where(eq(routines.id, id));
    },

    async expand(seeds: readonly RoutineTaskSeed[]) {
      if (seeds.length === 0) return 0;

      // 冪等展開（F-301 / データモデル定義書 §4.1-3）。
      // 既に展開済み（routine_id, task_date が同じ）の行は挿入されない
      const inserted = await db
        .insert(tasks)
        .values(seeds.map((seed) => ({ ...seed, routineId: seed.routineId })))
        .onConflictDoNothing({
          target: [tasks.routineId, tasks.taskDate],
          // 部分ユニーク索引（uq_tasks_routine_date）に合わせて述語も指定する
          where: sql`routine_id IS NOT NULL`,
        })
        .returning({ id: tasks.id });

      return inserted.length;
    },

    async listSkippedOn(date: LogicalDate) {
      const rows = await db
        .select({ routineId: routineSkips.routineId })
        .from(routineSkips)
        .where(eq(routineSkips.taskDate, date));
      return rows.map((row) => row.routineId);
    },
  };
}
