import { count, eq, inArray } from "drizzle-orm";
import type { ModeInput, ModeRepository } from "@/usecases/ports/mode-repository";
import type { Mode, ModeId } from "@/domain/mode/mode";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { modes, routines, tasks } from "@/infrastructure/db/schema";

type Row = typeof modes.$inferSelect;

function toDomain(row: Row): Mode {
  return { id: row.id, name: row.name, color: row.color, isArchived: row.isArchived };
}

export function createModeRepository(db: Database = defaultDb): ModeRepository {
  return {
    async listAll() {
      const rows = await db.select().from(modes);
      return rows.map(toDomain);
    },

    async create(input: ModeInput) {
      const [row] = await db.insert(modes).values(input).returning();
      return toDomain(row);
    },

    async update(id: ModeId, input: ModeInput) {
      await db
        .update(modes)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(modes.id, id));
    },

    async setArchived(id: ModeId, isArchived: boolean) {
      await db
        .update(modes)
        .set({ isArchived, updatedAt: new Date() })
        .where(eq(modes.id, id));
    },

    // 参照元はタスクとルーチンの2つ（画面定義書03 §4.1）
    async referenceCounts(ids: readonly ModeId[]) {
      if (ids.length === 0) return {};
      const target = [...ids];

      const [fromTasks, fromRoutines] = await Promise.all([
        db
          .select({ modeId: tasks.modeId, n: count() })
          .from(tasks)
          .where(inArray(tasks.modeId, target))
          .groupBy(tasks.modeId),
        db
          .select({ modeId: routines.modeId, n: count() })
          .from(routines)
          .where(inArray(routines.modeId, target))
          .groupBy(routines.modeId),
      ]);

      const counts: Record<ModeId, number> = {};
      for (const row of [...fromTasks, ...fromRoutines]) {
        if (row.modeId === null) continue;
        counts[row.modeId] = (counts[row.modeId] ?? 0) + row.n;
      }
      return counts;
    },

    async remove(id: ModeId) {
      await db.delete(modes).where(eq(modes.id, id));
    },
  };
}
