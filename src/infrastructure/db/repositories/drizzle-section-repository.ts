import { count, eq, inArray } from "drizzle-orm";
import type { SectionInput, SectionRepository } from "@/usecases/ports/section-repository";
import { normalizeStartTime, type Section, type SectionId } from "@/domain/section/section";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { sections, tasks } from "@/infrastructure/db/schema";

type Row = typeof sections.$inferSelect;

function toDomain(row: Row): Section {
  return {
    id: row.id,
    name: row.name,
    // time 型は "HH:MM:SS" で返るのでドメインの表現（"HH:MM"）へ揃える
    startTime: normalizeStartTime(row.startTime),
    isArchived: row.isArchived,
  };
}

export function createSectionRepository(db: Database = defaultDb): SectionRepository {
  return {
    async listAll() {
      const rows = await db.select().from(sections);
      return rows.map(toDomain);
    },

    async create(input: SectionInput) {
      const [row] = await db.insert(sections).values(input).returning();
      return toDomain(row);
    },

    async update(id: SectionId, input: SectionInput) {
      await db
        .update(sections)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(sections.id, id));
    },

    async setArchived(id: SectionId, isArchived: boolean) {
      await db
        .update(sections)
        .set({ isArchived, updatedAt: new Date() })
        .where(eq(sections.id, id));
    },

    // 参照元はタスクのみ（ルーチンは開始想定時刻からセクションを導出する。画面定義書03 §4.1）
    async referenceCounts(ids: readonly SectionId[]) {
      if (ids.length === 0) return {};

      const rows = await db
        .select({ sectionId: tasks.sectionId, n: count() })
        .from(tasks)
        .where(inArray(tasks.sectionId, [...ids]))
        .groupBy(tasks.sectionId);

      const counts: Record<SectionId, number> = {};
      for (const row of rows) {
        if (row.sectionId === null) continue;
        counts[row.sectionId] = row.n;
      }
      return counts;
    },

    async remove(id: SectionId) {
      await db.delete(sections).where(eq(sections.id, id));
    },
  };
}
