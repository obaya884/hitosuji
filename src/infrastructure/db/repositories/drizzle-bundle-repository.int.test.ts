import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { COLOR_BY_NAME } from "@/domain/shared/color-presets";
import { routines, tasks } from "@/infrastructure/db/schema";
import { createTestDb, truncateAll } from "@/infrastructure/db/testing/test-db";
import { createBundleRepository } from "./drizzle-bundle-repository";

const { db, pool } = createTestDb();
const repo = createBundleRepository(db);

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("referenceCounts（画面定義書05 §5: ルーチンとタスクの両方を数える）", () => {
  it("展開済みタスクからの参照も数える（道が出た日があるバンドルは消せない）", async () => {
    const used = await repo.create({ name: "使用中", color: COLOR_BY_NAME["青"] });
    const free = await repo.create({ name: "未使用", color: COLOR_BY_NAME["緑"] });

    await db
      .insert(tasks)
      .values({ taskDate: "2026-08-09", name: "朝食", sortOrder: 1000, bundleId: used.id });

    const counts = await repo.referenceCounts([used.id, free.id]);
    expect(counts[used.id]).toBe(1);
    expect(counts[free.id] ?? 0).toBe(0);
  });

  it("ルーチンからの参照を数える", async () => {
    const bundle = await repo.create({ name: "朝の立上げ", color: COLOR_BY_NAME["青"] });
    await db.insert(routines).values({
      name: "朝食",
      estimateMinutes: 20,
      scheduledStartTime: "06:30",
      recurrenceType: "daily",
      startDate: "2026-08-09",
      bundleId: bundle.id,
    });

    expect((await repo.referenceCounts([bundle.id]))[bundle.id]).toBe(1);
  });

  it("ルーチンとタスクの両方から参照されていれば合算する", async () => {
    const bundle = await repo.create({ name: "朝の立上げ", color: COLOR_BY_NAME["青"] });
    await db.insert(routines).values({
      name: "朝食",
      estimateMinutes: 20,
      scheduledStartTime: "06:30",
      recurrenceType: "daily",
      startDate: "2026-08-09",
      bundleId: bundle.id,
    });
    await db
      .insert(tasks)
      .values({ taskDate: "2026-08-09", name: "朝食", sortOrder: 1000, bundleId: bundle.id });

    expect((await repo.referenceCounts([bundle.id]))[bundle.id]).toBe(2);
  });
});

describe("create / update / setArchived / remove", () => {
  it("作成・更新・アーカイブ・削除が往復する", async () => {
    const created = await repo.create({ name: "朝の立上げ", color: COLOR_BY_NAME["青"] });
    expect(created).toEqual({
      id: expect.any(Number),
      name: "朝の立上げ",
      color: COLOR_BY_NAME["青"],
      isArchived: false,
    });

    await repo.update(created.id, { name: "01.朝", color: COLOR_BY_NAME["緑"] });
    await repo.setArchived(created.id, true);
    expect(await repo.listAll()).toEqual([
      { id: created.id, name: "01.朝", color: COLOR_BY_NAME["緑"], isArchived: true },
    ]);

    await repo.remove(created.id);
    expect(await repo.listAll()).toEqual([]);
  });
});
