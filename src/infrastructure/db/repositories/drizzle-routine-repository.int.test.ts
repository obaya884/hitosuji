import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ValidRoutineInput } from "@/domain/routine/input";
import { COLOR_BY_NAME } from "@/domain/shared/color-presets";
import { bundles, routineSkips, routines, tasks } from "@/infrastructure/db/schema";
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
    bundleId: null,
    recurrenceType: "daily",
    weekdays: null,
    weekInterval: null,
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
      bundleId: null,
      recurrenceType: "daily",
      weekdays: null,
      weekInterval: null,
      monthDay: null,
      intervalDays: null,
      startDate: "2026-07-19",
      endDate: null,
      isActive: true,
    });
  });

  it("繰り返し種別ごとの項目を保存できる（週間隔も往復する。FB-44）", async () => {
    // 隔週（week_interval=2）を明示し、新設カラムが DB を往復して復元されることを確認する
    await repo.create(input({ recurrenceType: "weekly", weekdays: 0b0010101, weekInterval: 2 }));
    await repo.create(input({ recurrenceType: "monthly", monthDay: 25 }));
    await repo.create(input({ recurrenceType: "interval", intervalDays: 3 }));

    const all = await repo.listAll();
    expect(
      all.map((r) => [r.recurrenceType, r.weekdays, r.weekInterval, r.monthDay, r.intervalDays])
    ).toEqual(
      expect.arrayContaining([
        ["weekly", 0b0010101, 2, null, null],
        ["monthly", null, null, 25, null],
        ["interval", null, null, null, 3],
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

  // ルーチンの更新・削除の存在検査（00_共通 §4.1）はこの null を「対象が無い」と読む
  it("存在しない id は例外でなく null を返す", async () => {
    const created = await repo.create(input());

    expect(await repo.findById(created.id + 1)).toBeNull();
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
        bundleId: null,
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
      bundleId: null,
      sortOrder: 1000,
    };

    expect(await repo.expand([seed])).toBe(1);
    expect(await repo.expand([{ ...seed, sortOrder: 9000 }])).toBe(0); // 2回目は挿入されない

    const all = await taskRepo.listByDate("2026-07-19");
    expect(all).toHaveLength(1);
    expect(all[0].sortOrder).toBe(1000); // 既存行は上書きされない
    // 展開されたタスクは常に未ハイライト（F-118。展開の入力に highlighted が無く DEFAULT false）
    expect(all[0].highlighted).toBe(false);
  });

  it("バンドル付きルーチンから生成したタスクに bundle_id が入る（データモデル定義書 §4.1 / F-119）", async () => {
    const [bundle] = await db
      .insert(bundles)
      .values({ name: "朝の立上げ", color: COLOR_BY_NAME["インディゴ"] })
      .returning();
    const created = await repo.create(input({ bundleId: bundle.id }));

    await repo.expand([
      {
        routineId: created.id,
        taskDate: "2026-07-19",
        name: "朝食",
        estimateMinutes: 20,
        sectionId: null,
        modeId: null,
        projectId: null,
        bundleId: bundle.id,
        sortOrder: 1000,
      },
    ]);

    const all = await taskRepo.listByDate("2026-07-19");
    expect(all[0].bundleId).toBe(bundle.id);
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
      bundleId: null,
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
      bundleId: null,
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

  // FB-99: 先送りは紐付けを外して移る（データモデル定義書 §3.5）ので、移動先の日の展開を吸わない。
  // 紐付けを保ったまま移す実装に戻すと、ここが 0 件展開に落ちる
  it("先送りされてきたタスクは移動先の日の展開を妨げない", async () => {
    const created = await repo.create(input());
    const [postponed] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: created.id })
      .returning();
    await taskRepo.postpone(
      postponed.id,
      { taskDate: "2026-07-20", sortOrder: 1000 },
      { routineId: created.id, taskDate: "2026-07-19" }
    );

    expect(
      await repo.expand([
        {
          routineId: created.id,
          taskDate: "2026-07-20",
          name: "朝食",
          estimateMinutes: 20,
          sectionId: null,
          modeId: null,
          projectId: null,
          bundleId: null,
          sortOrder: 2000,
        },
      ])
    ).toBe(1);
    expect(await taskRepo.listByDate("2026-07-20")).toHaveLength(2);
  });

  it("空の展開では何もしない", async () => {
    expect(await repo.expand([])).toBe(0);
  });
});

describe("setBundle / setScheduledStartTime（画面定義書05 O-5〜O-7）", () => {
  it("setBundle でバンドルへ入れて外せる", async () => {
    const [bundle] = await db
      .insert(bundles)
      .values({ name: "朝の立上げ", color: COLOR_BY_NAME["インディゴ"] })
      .returning();
    const created = await repo.create(input());

    await repo.setBundle(created.id, bundle.id);
    expect((await repo.findById(created.id))?.bundleId).toBe(bundle.id);

    await repo.setBundle(created.id, null);
    expect((await repo.findById(created.id))?.bundleId).toBeNull();
  });

  it("setScheduledStartTime は開始想定時刻だけを更新し、他の列を触らない", async () => {
    const created = await repo.create(input({ name: "朝食", estimateMinutes: 20 }));

    await repo.setScheduledStartTime(created.id, "08:05");

    const found = await repo.findById(created.id);
    expect(found?.scheduledStartTime).toBe("08:05");
    expect(found?.name).toBe("朝食");
    expect(found?.estimateMinutes).toBe(20);
  });
});

// 展開の抑止はこの読み出しが返す id 集合に全面的に依存する（スキップ済みを展開対象から外す）。
// 書き側（削除でスキップを記録する経路）は task リポジトリのテストが持つ
describe("listSkippedOn（F-301 / データモデル定義書 §3.6: スキップの読み出し）", () => {
  it("指定日のスキップだけを routine_id の配列で返す", async () => {
    const first = await repo.create(input({ name: "朝食" }));
    const second = await repo.create(input({ name: "散歩" }));
    await db.insert(routineSkips).values([
      // 別の日の記録を先に入れて、スキップ行の id とルーチンの id をずらす
      // （揃っていると、返す列を routine_skips.id と取り違えても値が一致してしまう）
      { routineId: first.id, taskDate: "2026-07-20" },
      { routineId: first.id, taskDate: "2026-07-19" },
      { routineId: second.id, taskDate: "2026-07-19" },
    ]);

    const skipped = await repo.listSkippedOn("2026-07-19");
    expect(skipped).toHaveLength(2);
    expect(skipped).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it("他日のスキップだけがある日は空配列を返す", async () => {
    const created = await repo.create(input());
    await db.insert(routineSkips).values({ routineId: created.id, taskDate: "2026-07-20" });

    expect(await repo.listSkippedOn("2026-07-19")).toEqual([]);
  });
});
