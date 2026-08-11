import { count, eq, inArray } from "drizzle-orm";
import type { BundleInput, BundleRepository } from "@/usecases/ports/bundle-repository";
import type { Bundle, BundleId } from "@/domain/bundle/bundle";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { bundles, routines, tasks } from "@/infrastructure/db/schema";
import { countReferences } from "./reference-counts";

type Row = typeof bundles.$inferSelect;

function toDomain(row: Row): Bundle {
  return { id: row.id, name: row.name, color: row.color, isArchived: row.isArchived };
}

export function createBundleRepository(db: Database = defaultDb): BundleRepository {
  return {
    async listAll() {
      const rows = await db.select().from(bundles);
      return rows.map(toDomain);
    },

    async create(input: BundleInput) {
      const [row] = await db.insert(bundles).values(input).returning();
      return toDomain(row);
    },

    async update(id: BundleId, input: BundleInput) {
      await db
        .update(bundles)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(bundles.id, id));
    },

    async setArchived(id: BundleId, isArchived: boolean) {
      await db
        .update(bundles)
        .set({ isArchived, updatedAt: new Date() })
        .where(eq(bundles.id, id));
    },

    // 参照元はルーチンとタスクの2つ（画面定義書05 §5）。
    // 展開済みタスクを数えるので、一度でも道が出た日があるバンドルは削除できない
    async referenceCounts(ids: readonly BundleId[]) {
      return countReferences(
        db,
        [
          [tasks, tasks.bundleId],
          [routines, routines.bundleId],
        ],
        ids
      );
    },

    // メンバー件数はルーチンの bundleId だけを数える（タスクは含めない。画面定義書05 §3.1）
    async memberCounts(ids: readonly BundleId[]) {
      if (ids.length === 0) return {};
      const rows = await db
        .select({ bundleId: routines.bundleId, n: count() })
        .from(routines)
        .where(inArray(routines.bundleId, [...ids]))
        .groupBy(routines.bundleId);

      const counts: Record<BundleId, number> = {};
      for (const row of rows) {
        if (row.bundleId === null) continue;
        counts[row.bundleId] = row.n;
      }
      return counts;
    },

    async remove(id: BundleId) {
      await db.delete(bundles).where(eq(bundles.id, id));
    },
  };
}
