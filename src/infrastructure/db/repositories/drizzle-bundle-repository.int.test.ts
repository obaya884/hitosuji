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

describe("memberCounts（画面定義書05 §3.1: バンドルごとのメンバー＝ルーチンの件数）", () => {
  it("バンドルに属するルーチンの件数を数える（タスクは数えない。referenceCounts とは別）", async () => {
    const used = await repo.create({ name: "使用中", color: COLOR_BY_NAME["青"] });
    const free = await repo.create({ name: "未使用", color: COLOR_BY_NAME["緑"] });
    await db.insert(routines).values({
      name: "朝食",
      estimateMinutes: 20,
      scheduledStartTime: "06:30",
      recurrenceType: "daily",
      startDate: "2026-08-09",
      bundleId: used.id,
    });
    // タスクだけの参照は数えない（referenceCounts と違い、メンバーはルーチンの所属そのもの）
    await db
      .insert(tasks)
      .values({ taskDate: "2026-08-09", name: "朝食", sortOrder: 1000, bundleId: free.id });

    const counts = await repo.memberCounts([used.id, free.id]);
    expect(counts[used.id]).toBe(1);
    expect(counts[free.id] ?? 0).toBe(0);
  });

  it("0件のバンドルの id は省略される", async () => {
    const empty = await repo.create({ name: "空のバンドル", color: COLOR_BY_NAME["青"] });

    expect(await repo.memberCounts([empty.id])).toEqual({});
  });

  it("無効ルーチン（is_active=false）も数える（所属は有効/無効を問わない）", async () => {
    const bundle = await repo.create({ name: "朝の立上げ", color: COLOR_BY_NAME["青"] });
    await db.insert(routines).values({
      name: "使わなくなった支度",
      estimateMinutes: 10,
      scheduledStartTime: "06:00",
      recurrenceType: "daily",
      startDate: "2026-08-09",
      bundleId: bundle.id,
      isActive: false,
    });

    expect((await repo.memberCounts([bundle.id]))[bundle.id]).toBe(1);
  });

  it("複数バンドルの件数を取り違えない", async () => {
    const morning = await repo.create({ name: "朝の立上げ", color: COLOR_BY_NAME["青"] });
    const evening = await repo.create({ name: "夜のまとめ", color: COLOR_BY_NAME["緑"] });
    await db.insert(routines).values([
      {
        name: "朝食",
        estimateMinutes: 20,
        scheduledStartTime: "06:30",
        recurrenceType: "daily",
        startDate: "2026-08-09",
        bundleId: morning.id,
      },
      {
        name: "洗面",
        estimateMinutes: 5,
        scheduledStartTime: "06:50",
        recurrenceType: "daily",
        startDate: "2026-08-09",
        bundleId: morning.id,
      },
      {
        name: "戸締り",
        estimateMinutes: 5,
        scheduledStartTime: "22:00",
        recurrenceType: "daily",
        startDate: "2026-08-09",
        bundleId: evening.id,
      },
    ]);

    const counts = await repo.memberCounts([morning.id, evening.id]);
    expect(counts[morning.id]).toBe(2);
    expect(counts[evening.id]).toBe(1);
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
