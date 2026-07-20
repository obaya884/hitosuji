import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MODE_COLORS, isPresetColor } from "@/domain/mode/mode";
import { modes, routines, tasks } from "@/infrastructure/db/schema";
import { createTestDb, truncateAll } from "@/infrastructure/db/testing/test-db";
import { seedMasters } from "@/infrastructure/db/seed";
import { createModeRepository } from "./drizzle-mode-repository";

const { db, pool } = createTestDb();
const repo = createModeRepository(db);

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("DrizzleModeRepository", () => {
  it("作成・一覧・更新・アーカイブが往復する", async () => {
    const created = await repo.create({ name: "仕事", color: MODE_COLORS[8] });
    expect(created).toEqual({
      id: expect.any(Number),
      name: "仕事",
      color: MODE_COLORS[8],
      isArchived: false,
    });

    await repo.update(created.id, { name: "01.仕事", color: MODE_COLORS[5] });
    await repo.setArchived(created.id, true);

    expect(await repo.listAll()).toEqual([
      { id: created.id, name: "01.仕事", color: MODE_COLORS[5], isArchived: true },
    ]);
  });
});

describe("物理削除の判定（画面定義書03 §4.1）", () => {
  it("タスクとルーチンの参照をどちらも数え、参照0件のモードは削除できる", async () => {
    const used = await repo.create({ name: "使用中", color: MODE_COLORS[8] });
    const unused = await repo.create({ name: "未使用", color: MODE_COLORS[5] });

    await db.insert(tasks).values([
      { taskDate: "2026-07-20", name: "T1", sortOrder: 1000, modeId: used.id },
      { taskDate: "2026-07-20", name: "T2", sortOrder: 2000, modeId: used.id },
    ]);
    await db.insert(routines).values({
      name: "R1",
      estimateMinutes: 10,
      scheduledStartTime: "06:30",
      recurrenceType: "daily",
      startDate: "2026-07-20",
      modeId: used.id,
    });

    expect(await repo.referenceCounts([used.id, unused.id])).toEqual({ [used.id]: 3 });

    await repo.remove(unused.id);
    expect((await repo.listAll()).map((m) => m.id)).toEqual([used.id]);
  });
});

describe("シードの初期データ（データモデル定義書 §5 / 画面定義書03 §3.2）", () => {
  it("投入されるモードの色はすべてプリセットに含まれる（画面から編集できる）", async () => {
    await seedMasters(db);
    const seeded = await repo.listAll();
    expect(seeded.length).toBeGreaterThan(0);
    for (const mode of seeded) {
      expect(isPresetColor(mode.color), `${mode.name} の色 ${mode.color}`).toBe(true);
    }
    expect(await db.select().from(modes)).toHaveLength(seeded.length);
  });
});
