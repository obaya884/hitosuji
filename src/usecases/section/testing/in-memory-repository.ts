// テスト用のインメモリ SectionRepository。
// 古典学派の「本物と同じ契約を満たす偽物」であってモックではない（アーキテクチャ定義書 §8）
import type { SectionInput, SectionRepository } from "@/usecases/ports/section-repository";
import type { Section, SectionId } from "@/domain/section/section";

export type InMemorySectionRepository = SectionRepository & {
  readonly rows: Section[];
};

export function inMemorySectionRepository(
  initial: readonly Section[] = []
): InMemorySectionRepository {
  const rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  const indexOf = (id: SectionId) => rows.findIndex((r) => r.id === id);

  return {
    rows,

    listAll: async () => [...rows],

    create: async (input: SectionInput) => {
      const created: Section = { id: nextId++, ...input, isArchived: false, isDayStart: false };
      rows.push(created);
      return created;
    },

    update: async (id: SectionId, input: SectionInput) => {
      const index = indexOf(id);
      if (index >= 0) rows[index] = { ...rows[index], ...input };
    },

    setArchived: async (id: SectionId, isArchived: boolean) => {
      const index = indexOf(id);
      if (index >= 0) rows[index] = { ...rows[index], isArchived };
    },

    setDayStart: async (id: SectionId) => {
      // 本物（drizzle）と同じく先に全て下ろしてから対象を立てる
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].isDayStart) rows[i] = { ...rows[i], isDayStart: false };
      }
      const index = indexOf(id);
      if (index >= 0) rows[index] = { ...rows[index], isDayStart: true };
    },

    referenceCounts: async () => ({}),

    remove: async (id: SectionId) => {
      const index = indexOf(id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
}
