import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { COLOR_BY_NAME } from "@/domain/shared/color-presets";
import { routines, tasks } from "@/infrastructure/db/schema";
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
    const created = await repo.create({ name: "仕事", color: COLOR_BY_NAME["青"] });
    expect(created).toEqual({
      id: expect.any(Number),
      name: "仕事",
      color: COLOR_BY_NAME["青"],
      isArchived: false,
    });

    await repo.update(created.id, { name: "01.仕事", color: COLOR_BY_NAME["緑"] });
    await repo.setArchived(created.id, true);

    expect(await repo.listAll()).toEqual([
      { id: created.id, name: "01.仕事", color: COLOR_BY_NAME["緑"], isArchived: true },
    ]);
  });
});

describe("物理削除の判定（画面定義書03 §4.1）", () => {
  it("タスクとルーチンの参照をどちらも数え、参照0件のモードは削除できる", async () => {
    const used = await repo.create({ name: "使用中", color: COLOR_BY_NAME["青"] });
    const unused = await repo.create({ name: "未使用", color: COLOR_BY_NAME["緑"] });

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
  // 色は `COLOR_BY_NAME` で固定する。値は定義上プリセットの要素なので、プリセットに
  // 含まれることを別に走査しても `seed.ts` が同じ表から引いている形の写しにしかならない
  it("投入されるモードの色はデータモデル定義書 §5 のとおり（仕事=青 / 暮らし=緑 / 休憩=グレー）", async () => {
    await seedMasters(db);
    const colorOf = new Map((await repo.listAll()).map((m) => [m.name, m.color]));

    expect(colorOf.get("仕事")).toBe(COLOR_BY_NAME["青"]);
    expect(colorOf.get("暮らし")).toBe(COLOR_BY_NAME["緑"]);
    expect(colorOf.get("休憩")).toBe(COLOR_BY_NAME["グレー"]);
  });
});
