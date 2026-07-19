import { eq } from "drizzle-orm";
import type { ModeInput, ModeRepository } from "@/usecases/ports/mode-repository";
import type { Mode, ModeId } from "@/domain/mode/mode";
import { db as defaultDb, type Database } from "@/infrastructure/db";
import { modes } from "@/infrastructure/db/schema";

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
  };
}
