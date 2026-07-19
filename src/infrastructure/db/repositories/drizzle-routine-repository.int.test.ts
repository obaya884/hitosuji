import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ValidRoutineInput } from "@/domain/routine/routine-input";
import { routines, tasks } from "@/infrastructure/db/schema";
import { createTestDb, truncateAll } from "@/infrastructure/db/testing/test-db";
import { createRoutineRepository } from "./drizzle-routine-repository";
import { createTaskRepository } from "./drizzle-task-repository";

const { db, pool } = createTestDb();
const repo = createRoutineRepository(db);
const taskRepo = createTaskRepository(db);

function input(over: Partial<ValidRoutineInput> = {}): ValidRoutineInput {
  return {
    name: "朝食",
    estimateMinutes: 20,
    scheduledStartTime: "06:30",
    modeId: null,
    projectId: null,
    recurrenceType: "daily",
    weekdays: null,
    monthDay: null,
    intervalDays: null,
    startDate: "2026-07-19",
    endDate: null,
    ...over,
  };
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("DrizzleRoutineRepository", () => {
  it("作成した行をドメイン表現（scheduledStartTime は HH:MM）で返す", async () => {
    const created = await repo.create(input());
    expect(created).toEqual({
      id: expect.any(Number),
      name: "朝食",
      estimateMinutes: 20,
      scheduledStartTime: "06:30",
      modeId: null,
      projectId: null,
      recurrenceType: "daily",
      weekdays: null,
      monthDay: null,
      intervalDays: null,
      startDate: "2026-07-19",
      endDate: null,
      isActive: true,
    });
  });

  it("繰り返し種別ごとの項目を保存できる", async () => {
    await repo.create(input({ recurrenceType: "weekly", weekdays: 0b0010101 }));
    await repo.create(input({ recurrenceType: "monthly", monthDay: 25 }));
    await repo.create(input({ recurrenceType: "interval", intervalDays: 3 }));

    const all = await repo.listAll();
    expect(all.map((r) => [r.recurrenceType, r.weekdays, r.monthDay, r.intervalDays])).toEqual(
      expect.arrayContaining([
        ["weekly", 0b0010101, null, null],
        ["monthly", null, 25, null],
        ["interval", null, null, 3],
      ])
    );
  });

  it("更新・有効切替ができる", async () => {
    const created = await repo.create(input());

    await repo.update(created.id, input({ name: "朝食（改）", estimateMinutes: 30 }));
    await repo.setActive(created.id, false);

    const found = await repo.findById(created.id);
    expect([found?.name, found?.estimateMinutes, found?.isActive]).toEqual([
      "朝食（改）",
      30,
      false,
    ]);
  });

  it("削除しても展開済みタスクは routine_id を NULL にして残る（画面定義書02 O-4）", async () => {
    const created = await repo.create(input());
    await repo.expand([
      {
        routineId: created.id,
        taskDate: "2026-07-19",
        name: "朝食",
        estimateMinutes: 20,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 1000,
      },
    ]);

    await repo.delete(created.id);

    const remaining = await taskRepo.listByDate("2026-07-19");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].routineId).toBeNull();
    expect(await db.select().from(routines)).toHaveLength(0);
  });
});

describe("expand（F-301: 冪等INSERT）", () => {
  it("同じ日付へ2回展開しても重複しない", async () => {
    const created = await repo.create(input());
    const seed = {
      routineId: created.id,
      taskDate: "2026-07-19",
      name: "朝食",
      estimateMinutes: 20,
      sectionId: null,
      modeId: null,
      projectId: null,
      sortOrder: 1000,
    };

    expect(await repo.expand([seed])).toBe(1);
    expect(await repo.expand([{ ...seed, sortOrder: 9000 }])).toBe(0); // 2回目は挿入されない

    const all = await taskRepo.listByDate("2026-07-19");
    expect(all).toHaveLength(1);
    expect(all[0].sortOrder).toBe(1000); // 既存行は上書きされない
  });

  it("日付が違えば同じルーチンでも展開される", async () => {
    const created = await repo.create(input());
    const seed = {
      routineId: created.id,
      name: "朝食",
      estimateMinutes: 20,
      sectionId: null,
      modeId: null,
      projectId: null,
      sortOrder: 1000,
    };

    await repo.expand([{ ...seed, taskDate: "2026-07-19" }]);
    await repo.expand([{ ...seed, taskDate: "2026-07-20" }]);

    expect(await taskRepo.listByDate("2026-07-19")).toHaveLength(1);
    expect(await taskRepo.listByDate("2026-07-20")).toHaveLength(1);
  });

  it("一部が既展開でも、未展開のルーチンだけが追加される", async () => {
    const first = await repo.create(input({ name: "朝食" }));
    const second = await repo.create(input({ name: "散歩" }));
    const base = {
      taskDate: "2026-07-19",
      estimateMinutes: 20,
      sectionId: null,
      modeId: null,
      projectId: null,
    };

    await repo.expand([{ ...base, routineId: first.id, name: "朝食", sortOrder: 1000 }]);
    const added = await repo.expand([
      { ...base, routineId: first.id, name: "朝食", sortOrder: 1000 },
      { ...base, routineId: second.id, name: "散歩", sortOrder: 2000 },
    ]);

    expect(added).toBe(1);
    expect((await taskRepo.listByDate("2026-07-19")).map((t) => t.name)).toEqual(
      expect.arrayContaining(["朝食", "散歩"])
    );
  });

  it("ルーチン由来でないタスクは冪等制約の対象外（同名でも共存できる）", async () => {
    await db.insert(tasks).values([
      { taskDate: "2026-07-19", name: "手動タスク", sortOrder: 1000 },
      { taskDate: "2026-07-19", name: "手動タスク", sortOrder: 2000 },
    ]);
    expect(await taskRepo.listByDate("2026-07-19")).toHaveLength(2);
  });

  it("空の展開では何もしない", async () => {
    expect(await repo.expand([])).toBe(0);
  });
});
