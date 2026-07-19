import { eq } from "drizzle-orm";
import type { SectionInput, SectionRepository } from "@/application/ports/section-repository";
import { normalizeStartTime, type Section, type SectionId } from "@/domain/section/section";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { sections } from "@/infrastructure/db/schema";

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
  };
}
