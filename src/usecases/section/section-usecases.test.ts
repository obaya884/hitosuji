import { describe, expect, it } from "vitest";
import type { SectionInput, SectionRepository } from "@/usecases/ports/section-repository";
import type { Section, SectionId } from "@/domain/section/section";
import {
  archiveSection,
  createSection,
  deleteSection,
  listSections,
  restoreSection,
  setDayStartSection,
  updateSection,
} from "./section-usecases";

// 古典学派: モックではなく Port の契約を満たすインメモリ実装（アーキテクチャ定義書 §8）
function inMemoryRepo(
  initial: readonly Section[] = [],
  counts: Readonly<Record<SectionId, number>> = {}
): SectionRepository & {
  rows: Section[];
} {
  const rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  return {
    rows,
    listAll: async () => [...rows],
    create: async (input: SectionInput) => {
      const created: Section = { id: nextId++, ...input, isArchived: false };
      rows.push(created);
      return created;
    },
    update: async (id: SectionId, input: SectionInput) => {
      const i = rows.findIndex((r) => r.id === id);
      rows[i] = { ...rows[i], ...input };
    },
    setArchived: async (id: SectionId, isArchived: boolean) => {
      const i = rows.findIndex((r) => r.id === id);
      rows[i] = { ...rows[i], isArchived };
    },
    setDayStart: async (id: SectionId) => {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].isDayStart) rows[i] = { ...rows[i], isDayStart: false };
      }
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows[i] = { ...rows[i], isDayStart: true };
    },
    referenceCounts: async (ids: readonly SectionId[]) =>
      Object.fromEntries(ids.filter((id) => id in counts).map((id) => [id, counts[id]])),
    remove: async (id: SectionId) => {
      rows.splice(
        rows.findIndex((r) => r.id === id),
        1
      );
    },
  };
}

const morning: Section = { id: 1, name: "朝", startTime: "06:00", isArchived: false };
const forenoon: Section = { id: 2, name: "午前", startTime: "09:00", isArchived: false };

describe("listSections", () => {
  it("有効セクションは枠（終了時刻付き）で、アーカイブ済みは別枠で返す", async () => {
    const archived: Section = { id: 3, name: "旧", startTime: "12:00", isArchived: true };
    const view = await listSections(inMemoryRepo([forenoon, morning, archived]));
    expect(view.ranges.map((r) => [r.section.name, r.endTime])).toEqual([
      ["朝", "09:00"],
      ["午前", "06:00"],
    ]);
    expect(view.archived.map((s) => s.id)).toEqual([3]);
  });

  it("削除できるのは参照0件のアーカイブ済みだけ（画面定義書03 §4.1）", async () => {
    const used: Section = { id: 3, name: "旧A", startTime: "12:00", isArchived: true };
    const unused: Section = { id: 4, name: "旧B", startTime: "15:00", isArchived: true };
    const view = await listSections(inMemoryRepo([morning, used, unused], { 3: 8 }));
    expect(view.deletableIds).toEqual([4]);
  });
});

describe("deleteSection（画面定義書03 §4.1: 物理削除）", () => {
  it("アーカイブ済み・参照0件なら削除する", async () => {
    const archived: Section = { id: 3, name: "誤作成", startTime: "12:00", isArchived: true };
    const repo = inMemoryRepo([morning, archived]);
    expect((await deleteSection(repo, 3)).ok).toBe(true);
    expect(repo.rows.map((s) => s.id)).toEqual([1]);
  });

  it("参照があれば削除しない", async () => {
    const archived: Section = { id: 3, name: "旧", startTime: "12:00", isArchived: true };
    const repo = inMemoryRepo([morning, archived], { 3: 1 });
    expect(await deleteSection(repo, 3)).toEqual({ ok: false, error: "has_references" });
    expect(repo.rows).toHaveLength(2);
  });

  it("有効なセクションは削除しない（最低1件の制約に触れる余地がない）", async () => {
    const repo = inMemoryRepo([morning]);
    expect(await deleteSection(repo, 1)).toEqual({ ok: false, error: "not_archived" });
    expect(repo.rows).toHaveLength(1);
  });
});

describe("createSection", () => {
  it("検証を通れば永続化する", async () => {
    const repo = inMemoryRepo([morning]);
    const r = await createSection(repo, { name: "午後", startTime: "12:00" });
    expect(r.ok).toBe(true);
    expect(repo.rows).toHaveLength(2);
  });

  it("開始時刻が重複する場合は永続化しない", async () => {
    const repo = inMemoryRepo([morning]);
    const r = await createSection(repo, { name: "早朝", startTime: "06:00" });
    expect(r).toEqual({ ok: false, error: "duplicate_start_time" });
    expect(repo.rows).toHaveLength(1);
  });
});

describe("updateSection", () => {
  it("自分の開始時刻を据え置いたまま名前を変更できる", async () => {
    const repo = inMemoryRepo([morning, forenoon]);
    const r = await updateSection(repo, morning.id, { name: "早朝", startTime: "06:00" });
    expect(r.ok).toBe(true);
    expect(repo.rows[0].name).toBe("早朝");
  });

  it("他の有効セクションと開始時刻が衝突したら更新しない", async () => {
    const repo = inMemoryRepo([morning, forenoon]);
    const r = await updateSection(repo, morning.id, { name: "朝", startTime: "09:00" });
    expect(r).toEqual({ ok: false, error: "duplicate_start_time" });
    expect(repo.rows[0].startTime).toBe("06:00");
  });
});

describe("archiveSection（有効セクション最低1件）", () => {
  it("2件あればアーカイブできる", async () => {
    const repo = inMemoryRepo([morning, forenoon]);
    expect((await archiveSection(repo, morning.id)).ok).toBe(true);
    expect(repo.rows[0].isArchived).toBe(true);
  });

  it("最後の1件はアーカイブできない", async () => {
    const repo = inMemoryRepo([morning]);
    expect(await archiveSection(repo, morning.id)).toEqual({
      ok: false,
      error: "last_active_section",
    });
    expect(repo.rows[0].isArchived).toBe(false);
  });

  it("日界セクションはアーカイブできない（F-116）", async () => {
    const dayStart: Section = { ...morning, isDayStart: true };
    const repo = inMemoryRepo([dayStart, forenoon]);
    expect(await archiveSection(repo, dayStart.id)).toEqual({
      ok: false,
      error: "day_start_section",
    });
    expect(repo.rows[0].isArchived).toBe(false);
  });
});

describe("setDayStartSection（F-116: 日界セクションの切り替え）", () => {
  it("指定した有効セクションを日界にし、他の日界は下ろす（1件だけ）", async () => {
    const oldDayStart: Section = { ...morning, isDayStart: true };
    const repo = inMemoryRepo([oldDayStart, forenoon]);

    expect((await setDayStartSection(repo, forenoon.id)).ok).toBe(true);
    expect(repo.rows.find((s) => s.id === forenoon.id)?.isDayStart).toBe(true);
    expect(repo.rows.find((s) => s.id === morning.id)?.isDayStart).toBe(false);
    expect(repo.rows.filter((s) => s.isDayStart)).toHaveLength(1);
  });

  it("アーカイブ済みセクションは日界にしない（何も変えない）", async () => {
    const archived: Section = { id: 3, name: "旧", startTime: "12:00", isArchived: true };
    const dayStart: Section = { ...morning, isDayStart: true };
    const repo = inMemoryRepo([dayStart, archived]);

    expect((await setDayStartSection(repo, archived.id)).ok).toBe(true);
    expect(repo.rows.find((s) => s.id === archived.id)?.isDayStart ?? false).toBe(false);
    expect(repo.rows.find((s) => s.id === morning.id)?.isDayStart).toBe(true);
  });
});

describe("restoreSection", () => {
  it("開始時刻が空いていれば復元できる", async () => {
    const archived: Section = { id: 3, name: "旧", startTime: "12:00", isArchived: true };
    const repo = inMemoryRepo([morning, archived]);
    expect((await restoreSection(repo, 3)).ok).toBe(true);
    expect(repo.rows[1].isArchived).toBe(false);
  });

  it("有効セクションと開始時刻が重複するなら復元しない", async () => {
    const archived: Section = { id: 3, name: "旧朝", startTime: "06:00", isArchived: true };
    const repo = inMemoryRepo([morning, archived]);
    expect(await restoreSection(repo, 3)).toEqual({
      ok: false,
      error: "duplicate_start_time",
    });
    expect(repo.rows[1].isArchived).toBe(true);
  });
});
