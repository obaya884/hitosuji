import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { routineSkips, routines, sections, tasks } from "@/infrastructure/db/schema";
import { createTestDb, truncateAll } from "@/infrastructure/db/testing/test-db";
import { createTaskRepository } from "./drizzle-task-repository";

const { db, pool } = createTestDb();
const repo = createTaskRepository(db);

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("DrizzleTaskRepository.listByDate（画面定義書01 §7: 表示日1日分のみ取得）", () => {
  it("指定した task_date のタスクだけを返す", async () => {
    await db.insert(tasks).values([
      { taskDate: "2026-07-19", name: "当日", sortOrder: 1000 },
      { taskDate: "2026-07-20", name: "翌日", sortOrder: 1000 },
    ]);

    const found = await repo.listByDate("2026-07-19");
    expect(found.map((t) => t.name)).toEqual(["当日"]);
  });

  it("打刻・属性をドメイン表現へ写す", async () => {
    const [section] = await db
      .insert(sections)
      .values({ name: "朝", startTime: "06:00" })
      .returning();
    const startedAt = new Date("2026-07-19T06:30:00Z");
    const endedAt = new Date("2026-07-19T06:48:00Z");

    await db.insert(tasks).values({
      taskDate: "2026-07-19",
      name: "朝食",
      estimateMinutes: 20,
      sectionId: section.id,
      sortOrder: 2000,
      startedAt,
      endedAt,
      postponedCount: 1,
    });

    expect(await repo.listByDate("2026-07-19")).toEqual([
      {
        id: expect.any(Number),
        taskDate: "2026-07-19",
        name: "朝食",
        estimateMinutes: 20,
        sectionId: section.id,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
        startedAt,
        endedAt,
        comment: null,
        routineId: null,
        splitParentId: null,
        postponedCount: 1,
      },
    ]);
  });

  it("タスクがない日は空配列を返す", async () => {
    expect(await repo.listByDate("2026-07-19")).toEqual([]);
  });
});

describe("start（F-201: 付帯更新なしの開始打刻）", () => {
  it("割り込みも移動もなければ started_at だけを書き、配置は動かさない", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 1000, sectionId: morning.id },
      ])
      .returning();
    const startedAt = new Date("2026-07-19T06:30:00Z");

    await repo.start({ taskId: target.id, startedAt, interruption: null, relocations: [] });

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt);
    expect(after.endedAt).toBeNull();
    expect([after.sectionId, after.sortOrder]).toEqual([morning.id, 1000]);
  });
});

describe("start の割り込み（F-201: 終了・再開タスク生成・開始を1トランザクションで）", () => {
  it("3つの更新がすべて反映される", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running, target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "メールチェック", estimateMinutes: 30, sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "設計書レビュー", estimateMinutes: 60, sortOrder: 2000 },
      ])
      .returning();

    await repo.start({
      taskId: target.id,
      startedAt: endedAt,
      interruption: {
        runningTaskId: running.id,
        endedAt,
        resumeTask: {
          taskDate: "2026-07-19",
          name: "メールチェック",
          estimateMinutes: 18,
          sectionId: null,
          modeId: null,
          projectId: null,
          sortOrder: 3000,
          splitParentId: running.id,
        },
        renumber: [],
      },
      relocations: [],
    });

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toEqual(endedAt);
    expect(after.find((t) => t.id === target.id)?.startedAt).toEqual(endedAt);
    expect(after.find((t) => t.splitParentId === running.id)).toEqual(
      expect.objectContaining({ name: "メールチェック", estimateMinutes: 18, startedAt: null })
    );
  });

  it("再開タスクの生成に失敗したら全体が巻き戻る（トランザクション境界の確認）", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const [running, target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "実行中", sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 2000 },
      ])
      .returning();

    await expect(
      repo.start({
        taskId: target.id,
        startedAt: new Date("2026-07-19T09:00:00Z"),
        interruption: {
          runningTaskId: running.id,
          endedAt: new Date("2026-07-19T09:00:00Z"),
          resumeTask: {
            taskDate: "2026-07-19",
            name: "再開",
            estimateMinutes: 10,
            sectionId: 999999, // 存在しないセクション → FK違反
            modeId: null,
            projectId: null,
            sortOrder: 3000,
            splitParentId: running.id,
          },
          renumber: [],
        },
        relocations: [],
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toBeNull();
    expect(after.find((t) => t.id === target.id)?.startedAt).toBeNull();
    expect(after).toHaveLength(2);
  });

  // 割り込み（§4.2）に振り直し（§3.5）と自動セクション移動（§4.2-a）が同時に伴う経路。
  // 付帯更新が両方とも非空になるのはここだけなので、5つの更新の合流をここで固定する
  it("振り直しと移動を伴う割り込みで、5つの更新がすべて反映される", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running, target, neighbor] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "実行中", estimateMinutes: 30, sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 2000 },
        { taskDate: "2026-07-19", name: "詰まっている隣", sortOrder: 2001 },
      ])
      .returning();

    await repo.start({
      taskId: target.id,
      startedAt: endedAt,
      interruption: {
        runningTaskId: running.id,
        endedAt,
        resumeTask: {
          taskDate: "2026-07-19",
          name: "実行中",
          estimateMinutes: 18,
          sectionId: night.id,
          modeId: null,
          projectId: null,
          sortOrder: 4000,
          splitParentId: running.id,
        },
        renumber: [{ taskId: neighbor.id, sortOrder: 5000 }],
      },
      relocations: [{ taskId: target.id, sectionId: night.id, sortOrder: 3000 }],
    });

    const after = await repo.listByDate("2026-07-19");
    const started = after.find((t) => t.id === target.id);
    expect(after.find((t) => t.id === running.id)?.endedAt).toEqual(endedAt); // ①実行中を終了
    expect(after.find((t) => t.splitParentId === running.id)).toEqual(
      expect.objectContaining({ estimateMinutes: 18, sortOrder: 4000, startedAt: null })
    ); // ②再開タスクを生成
    expect(started?.startedAt).toEqual(endedAt); // ③対象を開始
    expect([started?.sectionId, started?.sortOrder]).toEqual([night.id, 3000]); // ④対象を移動
    expect(after.find((t) => t.id === neighbor.id)?.sortOrder).toBe(5000); // ⑤隣を振り直し
  });

  it("再開タスクの生成に失敗したら振り直しと移動も巻き戻る", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running, target, neighbor] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "実行中", sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 2000 },
        { taskDate: "2026-07-19", name: "詰まっている隣", sortOrder: 2001 },
      ])
      .returning();

    await expect(
      repo.start({
        taskId: target.id,
        startedAt: endedAt,
        interruption: {
          runningTaskId: running.id,
          endedAt,
          resumeTask: {
            taskDate: "2026-07-19",
            name: "再開",
            estimateMinutes: 10,
            sectionId: 999999, // 存在しないセクション → FK違反
            modeId: null,
            projectId: null,
            sortOrder: 4000,
            splitParentId: running.id,
          },
          renumber: [{ taskId: neighbor.id, sortOrder: 5000 }],
        },
        relocations: [{ taskId: target.id, sectionId: night.id, sortOrder: 3000 }],
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === neighbor.id)?.sortOrder).toBe(2001); // 振り直しが巻き戻っている
    expect(after.find((t) => t.id === target.id)?.sectionId).toBeNull(); // 移動も巻き戻っている
  });
});

describe("duplicateAndStart（F-208 / データモデル定義書 §4.6: 複製して開始）", () => {
  it("割り込みなしで、開始済みの複製タスクを生成する", async () => {
    const startedAt = new Date("2026-07-19T08:00:00Z");
    const endedAt = new Date("2026-07-19T08:30:00Z");
    const now = new Date("2026-07-19T09:00:00Z");
    const [source] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "ストレッチ", estimateMinutes: 15, sortOrder: 1000, startedAt, endedAt },
      ])
      .returning();

    const created = await repo.duplicateAndStart({
      newTask: {
        taskDate: "2026-07-19",
        name: source.name,
        estimateMinutes: 15,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
        splitParentId: null,
      },
      startedAt: now,
      interruption: null,
    });

    expect(created).toEqual(
      expect.objectContaining({ name: "ストレッチ", estimateMinutes: 15, startedAt: now, endedAt: null })
    );
    const after = await repo.listByDate("2026-07-19");
    expect(after).toHaveLength(2);
    // 複製元は完了のまま
    expect(after.find((t) => t.id === source.id)?.endedAt).toEqual(endedAt);
  });

  it("割り込みありで、終了・再開タスク生成・複製の開始が1トランザクションで反映される", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const now = new Date("2026-07-19T09:00:00Z");
    const [source, running] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "もう一回やる", estimateMinutes: 20, sortOrder: 1000, startedAt, endedAt: now },
        { taskDate: "2026-07-19", name: "実行中", estimateMinutes: 30, sortOrder: 5000, startedAt },
      ])
      .returning();

    const created = await repo.duplicateAndStart({
      newTask: {
        taskDate: "2026-07-19",
        name: source.name,
        estimateMinutes: 20,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 6000,
        splitParentId: null,
      },
      startedAt: now,
      interruption: {
        runningTaskId: running.id,
        endedAt: now,
        resumeTask: {
          taskDate: "2026-07-19",
          name: "実行中",
          estimateMinutes: 18,
          sectionId: null,
          modeId: null,
          projectId: null,
          sortOrder: 7000,
          splitParentId: running.id,
        },
      },
    });

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toEqual(now); // 実行中を終了
    expect(after.find((t) => t.id === created.id)?.startedAt).toEqual(now); // 複製を開始
    expect(after.find((t) => t.splitParentId === running.id)).toEqual(
      expect.objectContaining({ name: "実行中", estimateMinutes: 18, sortOrder: 7000, startedAt: null })
    );
  });

  it("再開タスクの生成に失敗したら全体が巻き戻る（トランザクション境界）", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const now = new Date("2026-07-19T09:00:00Z");
    const [, running] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "複製元", sortOrder: 1000, startedAt, endedAt: now },
        { taskDate: "2026-07-19", name: "実行中", sortOrder: 5000, startedAt },
      ])
      .returning();

    await expect(
      repo.duplicateAndStart({
        newTask: {
          taskDate: "2026-07-19",
          name: "複製",
          estimateMinutes: 10,
          sectionId: null,
          modeId: null,
          projectId: null,
          sortOrder: 6000,
          splitParentId: null,
        },
        startedAt: now,
        interruption: {
          runningTaskId: running.id,
          endedAt: now,
          resumeTask: {
            taskDate: "2026-07-19",
            name: "再開",
            estimateMinutes: 10,
            sectionId: 999999, // 存在しないセクション → FK違反
            modeId: null,
            projectId: null,
            sortOrder: 7000,
            splitParentId: running.id,
          },
        },
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toBeNull(); // 終了が巻き戻る
    expect(after).toHaveLength(2); // 複製も再開も作られない
  });
});

describe("findRunning（実行中は全日付を通じて最大1件）", () => {
  it("日付をまたいでも実行中タスクを見つける", async () => {
    await db.insert(tasks).values([
      { taskDate: "2026-07-18", name: "前日の実行中", sortOrder: 1000, startedAt: new Date("2026-07-18T23:00:00Z") },
      { taskDate: "2026-07-19", name: "未実行", sortOrder: 1000 },
    ]);

    expect((await repo.findRunning())?.name).toBe("前日の実行中");
  });

  it("実行中がなければ null", async () => {
    await db.insert(tasks).values({ taskDate: "2026-07-19", name: "未実行", sortOrder: 1000 });
    expect(await repo.findRunning()).toBeNull();
  });
});

describe("suspend（F-204: 終了と再開タスク生成を1トランザクションで）", () => {
  it("元タスクの終了と再開タスクの生成が両方反映される", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "執筆", estimateMinutes: 30, sortOrder: 1000, startedAt })
      .returning();

    await repo.suspend({
      taskId: running.id,
      endedAt,
      resumeTask: {
        taskDate: "2026-07-19",
        name: "執筆",
        estimateMinutes: 18,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
        splitParentId: running.id,
      },
      renumber: [],
    });

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toEqual(endedAt);
    expect(after.find((t) => t.splitParentId === running.id)).toEqual(
      expect.objectContaining({ name: "執筆", estimateMinutes: 18, startedAt: null })
    );
  });
});

describe("postpone（F-107: 先送り）", () => {
  it("task_date を付け替え postponed_count を加算する", async () => {
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "先送り対象", sortOrder: 1000, postponedCount: 1 })
      .returning();

    await repo.postpone(target.id, { taskDate: "2026-07-20", sortOrder: 3000 });

    expect(await repo.listByDate("2026-07-19")).toHaveLength(0);
    expect((await repo.listByDate("2026-07-20"))[0]).toEqual(
      expect.objectContaining({ taskDate: "2026-07-20", sortOrder: 3000, postponedCount: 2 })
    );
  });
});

describe("delete / restore（O-8: 削除と取り消し）", () => {
  it("削除したタスクを打刻ごと復元できる", async () => {
    const startedAt = new Date("2026-07-19T08:00:00Z");
    const endedAt = new Date("2026-07-19T08:30:00Z");
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "消すタスク", sortOrder: 1000, startedAt, endedAt })
      .returning();

    await repo.delete(target.id, null);
    expect(await repo.listByDate("2026-07-19")).toHaveLength(0);

    const { id, ...rest } = { ...target, taskDate: "2026-07-19" };
    void id;
    await repo.restore({ ...rest, startedAt, endedAt }, null);

    const restored = await repo.listByDate("2026-07-19");
    expect(restored).toHaveLength(1);
    expect(restored[0]).toEqual(
      expect.objectContaining({ name: "消すタスク", startedAt, endedAt })
    );
  });
});

describe("ルーチン由来タスクの削除とスキップ（F-301 / データモデル定義書 §3.6）", () => {
  async function createRoutine() {
    const [row] = await db
      .insert(routines)
      .values({
        name: "朝食",
        estimateMinutes: 20,
        scheduledStartTime: "06:30",
        recurrenceType: "daily",
        startDate: "2026-07-19",
      })
      .returning();
    return row;
  }

  it("削除すると同じトランザクションでスキップが記録される", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({
        taskDate: "2026-07-19",
        name: "朝食",
        sortOrder: 1000,
        routineId: routine.id,
      })
      .returning();

    await repo.delete(target.id, { routineId: routine.id, taskDate: "2026-07-19" });

    expect(await repo.listByDate("2026-07-19")).toHaveLength(0);
    expect(await db.select().from(routineSkips)).toEqual([
      expect.objectContaining({ routineId: routine.id, taskDate: "2026-07-19" }),
    ]);
  });

  it("復元するとスキップが解除される（再展開できる状態に戻る）", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({
        taskDate: "2026-07-19",
        name: "朝食",
        sortOrder: 1000,
        routineId: routine.id,
      })
      .returning();
    const skip = { routineId: routine.id, taskDate: "2026-07-19" };

    await repo.delete(target.id, skip);
    const { id, ...rest } = { ...target, taskDate: "2026-07-19" };
    void id;
    await repo.restore(rest, skip);

    expect(await repo.listByDate("2026-07-19")).toHaveLength(1);
    expect(await db.select().from(routineSkips)).toHaveLength(0);
  });

  it("同じ日に複数回スキップを記録しても1件（記録も冪等）", async () => {
    const routine = await createRoutine();
    const skip = { routineId: routine.id, taskDate: "2026-07-19" };

    // 削除 → 再展開 → また削除、という流れでも記録は増えない
    for (let attempt = 0; attempt < 2; attempt++) {
      const [task] = await db
        .insert(tasks)
        .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id })
        .returning();
      await repo.delete(task.id, skip);
    }

    expect(await db.select().from(routineSkips)).toHaveLength(1);
  });

  it("ルーチンを削除するとスキップも消える（ON DELETE CASCADE）", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id })
      .returning();

    await repo.delete(target.id, { routineId: routine.id, taskDate: "2026-07-19" });
    await db.delete(routines).where(eq(routines.id, routine.id));

    expect(await db.select().from(routineSkips)).toHaveLength(0);
  });
});

describe("create の振り直し（データモデル定義書 §3.5: 中間値が尽きたとき）", () => {
  it("振り直しなし（空配列）は単文で挿入し、挿入行をドメイン表現で返す", async () => {
    const created = await repo.create(
      {
        taskDate: "2026-07-19",
        name: "クイック追加",
        estimateMinutes: 0,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 1000,
      },
      []
    );

    expect(created).toEqual({
      id: expect.any(Number),
      taskDate: "2026-07-19",
      name: "クイック追加",
      estimateMinutes: 0,
      sectionId: null,
      modeId: null,
      projectId: null,
      sortOrder: 1000,
      startedAt: null,
      endedAt: null,
      comment: null,
      routineId: null,
      splitParentId: null,
      postponedCount: 0,
    });
    expect(await repo.listByDate("2026-07-19")).toEqual([created]);
  });

  it("振り直しと挿入が同じトランザクションで反映される", async () => {
    const [first, second] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000 },
        { taskDate: "2026-07-19", name: "B", sortOrder: 1001 },
      ])
      .returning();

    await repo.create(
      {
        taskDate: "2026-07-19",
        name: "割り込み",
        estimateMinutes: 0,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
      },
      [
        { taskId: first.id, sortOrder: 1000 },
        { taskId: second.id, sortOrder: 3000 },
      ]
    );

    const after = (await repo.listByDate("2026-07-19")).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(after.map((t) => [t.name, t.sortOrder])).toEqual([
      ["A", 1000],
      ["割り込み", 2000],
      ["B", 3000],
    ]);
  });

  it("挿入に失敗したら振り直しも巻き戻る", async () => {
    const [first] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "A", sortOrder: 1000 })
      .returning();

    await expect(
      repo.create(
        {
          taskDate: "2026-07-19",
          name: "不正",
          estimateMinutes: 0,
          sectionId: 999999, // 存在しないセクション → FK違反
          modeId: null,
          projectId: null,
          sortOrder: 2000,
        },
        [{ taskId: first.id, sortOrder: 5000 }]
      )
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after).toHaveLength(1);
    expect(after[0].sortOrder).toBe(1000); // 振り直しが巻き戻っている
  });
});

describe("move（画面定義書01 O-6 / データモデル定義書 §3.5: 並び替え）", () => {
  it("振り直しなし（空配列）は section_id と sort_order を単文で更新する", async () => {
    const [morning, forenoon] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "午前", startTime: "09:00" },
      ])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "移動対象", sortOrder: 1000, sectionId: morning.id },
      ])
      .returning();

    await repo.move({ taskId: target.id, sectionId: forenoon.id, sortOrder: 1500, renumber: [] });

    const [after] = await repo.listByDate("2026-07-19");
    expect([after.sectionId, after.sortOrder]).toEqual([forenoon.id, 1500]);
  });

  it("振り直しを伴う移動は振り直しと本体更新が同じトランザクションで反映される", async () => {
    await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000 },
        { taskDate: "2026-07-19", name: "B", sortOrder: 1001 },
        { taskDate: "2026-07-19", name: "移動対象", sortOrder: 5000 },
      ])
      .returning();
    const byName = Object.fromEntries(
      (await repo.listByDate("2026-07-19")).map((t) => [t.name, t.id])
    );

    // A と B の間へ移動する（中間値が尽きているのでグループ全体を1000刻みへ振り直す）
    await repo.move({
      taskId: byName["移動対象"],
      sectionId: null,
      sortOrder: 2000,
      renumber: [
        { taskId: byName["A"], sortOrder: 1000 },
        { taskId: byName["B"], sortOrder: 3000 },
      ],
    });

    const after = (await repo.listByDate("2026-07-19")).sort((x, y) => x.sortOrder - y.sortOrder);
    expect(after.map((t) => [t.name, t.sortOrder])).toEqual([
      ["A", 1000],
      ["移動対象", 2000],
      ["B", 3000],
    ]);
  });

  it("移動に失敗したら振り直しも巻き戻る", async () => {
    const [a, target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000 },
        { taskDate: "2026-07-19", name: "移動対象", sortOrder: 2000 },
      ])
      .returning();

    await expect(
      repo.move({
        taskId: target.id,
        sectionId: 999999, // 存在しないセクション → FK違反
        sortOrder: 3000,
        renumber: [{ taskId: a.id, sortOrder: 5000 }],
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === a.id)?.sortOrder).toBe(1000); // 振り直しが巻き戻っている
  });
});

describe("relocate（F-113 / データモデル定義書 §4.4: 自動セクション移動）", () => {
  it("複数行の section_id と sort_order がまとめて反映される", async () => {
    const [morning, forenoon] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "午前", startTime: "09:00" },
      ])
      .returning();
    const [a, b] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000, sectionId: morning.id },
        { taskDate: "2026-07-19", name: "B", sortOrder: 2000, sectionId: morning.id },
      ])
      .returning();

    await repo.relocate([
      { taskId: a.id, sectionId: forenoon.id, sortOrder: 500 },
      { taskId: b.id, sectionId: forenoon.id, sortOrder: 600 },
    ]);

    const after = await repo.listByDate("2026-07-19");
    expect(after.map((t) => [t.id, t.sectionId, t.sortOrder])).toEqual(
      expect.arrayContaining([
        [a.id, forenoon.id, 500],
        [b.id, forenoon.id, 600],
      ])
    );
  });

  it("途中で失敗した場合は1件も反映されない（1トランザクション）", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const [a] = await db
      .insert(tasks)
      .values([{ taskDate: "2026-07-19", name: "A", sortOrder: 1000, sectionId: morning.id }])
      .returning();

    await expect(
      repo.relocate([
        { taskId: a.id, sectionId: morning.id, sortOrder: 500 },
        { taskId: a.id, sectionId: 999999, sortOrder: 600 }, // 存在しないセクション → FK違反
      ])
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after[0].sortOrder).toBe(1000); // 1件目の更新も巻き戻っている
  });

  it("start（§4.2-a）: 打刻と移動が同じトランザクションで反映される", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([{ taskDate: "2026-07-19", name: "未分類のタスク", sortOrder: 1000 }])
      .returning();
    const startedAt = new Date("2026-07-19T09:00:00Z");

    await repo.start({
      taskId: target.id,
      startedAt,
      interruption: null,
      relocations: [{ taskId: target.id, sectionId: night.id, sortOrder: 1000 }],
    });

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt);
    expect(after.sectionId).toBe(night.id);
  });
});

describe("undoStart（F-210 / データモデル定義書 §4.5: 開始打刻の取り消し）", () => {
  it("started_at を null に戻し、並べ直しを同じトランザクションで反映する", async () => {
    const [morning, night] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "夜", startTime: "18:00" },
      ])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        {
          taskDate: "2026-07-19",
          name: "実行中タスク",
          sortOrder: 1000,
          sectionId: morning.id,
          startedAt: new Date("2026-07-19T09:00:00Z"),
        },
      ])
      .returning();

    await repo.undoStart(target.id, [{ taskId: target.id, sectionId: night.id, sortOrder: 500 }]);

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toBeNull();
    expect(after.sectionId).toBe(night.id);
    expect(after.sortOrder).toBe(500);
  });

  // 並べ直しが空＝単文経路。「今日以外は並べ直さない」という規則そのものはユースケース側の
  // 責務（punch-usecases の relocationsForUndoPunch）で、リポジトリは today を知らない
  it("並べ直しが空なら started_at のクリアだけを単文で行う", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        {
          taskDate: "2026-07-18",
          name: "前日の実行中タスク",
          sortOrder: 1000,
          sectionId: morning.id,
          startedAt: new Date("2026-07-18T09:00:00Z"),
        },
      ])
      .returning();

    await repo.undoStart(target.id, []);

    const [after] = await repo.listByDate("2026-07-18");
    expect(after.startedAt).toBeNull();
    expect(after.sectionId).toBe(morning.id); // 並べ直さない
  });
});

describe("undoComplete（F-212 / データモデル定義書 §4.7: 完了の取り消し）", () => {
  const startedAt = new Date("2026-07-19T09:00:00Z");
  const endedAt = new Date("2026-07-19T09:30:00Z");

  async function insertCompleted(taskDate: string, sectionId: number) {
    const [target] = await db
      .insert(tasks)
      .values([
        { taskDate, name: "完了タスク", sortOrder: 1000, sectionId, startedAt, endedAt },
      ])
      .returning();
    return target;
  }

  it("started_at・ended_at をともに null に戻し、並べ直しを同じトランザクションで反映する", async () => {
    const [morning, night] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "夜", startTime: "18:00" },
      ])
      .returning();
    const target = await insertCompleted("2026-07-19", morning.id);

    await repo.undoComplete(target.id, [
      { taskId: target.id, sectionId: night.id, sortOrder: 500 },
    ]);

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toBeNull();
    expect(after.endedAt).toBeNull();
    expect(after.sectionId).toBe(night.id);
    expect(after.sortOrder).toBe(500);
  });

  // 上の undoStart と同じく、空配列＝単文経路の確認（「今日以外」の判断はユースケース側）
  it("並べ直しが空なら打刻2列のクリアだけを単文で行う", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const target = await insertCompleted("2026-07-18", morning.id);

    await repo.undoComplete(target.id, []);

    const [after] = await repo.listByDate("2026-07-18");
    expect(after.startedAt).toBeNull();
    expect(after.endedAt).toBeNull();
    expect(after.sectionId).toBe(morning.id); // 並べ直さない
  });

  it("並べ直しが失敗したら打刻のクリアも巻き戻る（1トランザクション）", async () => {
    const [morning, night] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "夜", startTime: "18:00" },
      ])
      .returning();
    const target = await insertCompleted("2026-07-19", morning.id);

    await expect(
      repo.undoComplete(target.id, [
        { taskId: target.id, sectionId: night.id, sortOrder: 500 },
        { taskId: target.id, sectionId: 999999, sortOrder: 600 }, // 存在しないセクション → FK違反
      ])
    ).rejects.toThrow();

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt); // 完了のまま巻き戻っている
    expect(after.endedAt).toEqual(endedAt);
    expect(after.sectionId).toBe(morning.id);
  });

  it("復帰（updatePunch）で打刻2列と配置2列が同じトランザクションで戻る", async () => {
    const [morning, night] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "夜", startTime: "18:00" },
      ])
      .returning();
    const target = await insertCompleted("2026-07-19", morning.id);

    await repo.undoComplete(target.id, [
      { taskId: target.id, sectionId: night.id, sortOrder: 500 },
    ]);
    await repo.updatePunch(target.id, { startedAt, endedAt }, [
      { taskId: target.id, sectionId: morning.id, sortOrder: 1000 },
    ]);

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt);
    expect(after.endedAt).toEqual(endedAt);
    expect(after.sectionId).toBe(morning.id);
    expect(after.sortOrder).toBe(1000);
  });

  it("復帰先の sort_order を他タスクが取っていても書き戻せる（同値を許容。§4.7）", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const target = await insertCompleted("2026-07-19", morning.id);
    // 取り消し中に別タスクが復帰先と同じ sort_order（1000）を取る
    await db.insert(tasks).values([
      {
        taskDate: "2026-07-19",
        name: "同値の未実行タスク",
        sortOrder: 1000,
        sectionId: morning.id,
      },
    ]);

    await repo.undoComplete(target.id, [
      { taskId: target.id, sectionId: morning.id, sortOrder: 2000 },
    ]);
    await repo.updatePunch(target.id, { startedAt, endedAt }, [
      { taskId: target.id, sectionId: morning.id, sortOrder: 1000 },
    ]);

    const rows = await repo.listByDate("2026-07-19");
    expect(rows.filter((t) => t.sortOrder === 1000)).toHaveLength(2); // sort_order にユニーク制約は無い
    expect(rows.find((t) => t.id === target.id)?.endedAt).toEqual(endedAt);
  });

  it("未分類（section_id IS NULL）の完了タスクも取り消し・復帰できる", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "未分類の完了タスク", sortOrder: 1000, startedAt, endedAt },
      ])
      .returning();

    await repo.undoComplete(target.id, [
      { taskId: target.id, sectionId: night.id, sortOrder: 1000 },
    ]);
    await repo.updatePunch(target.id, { startedAt, endedAt }, [
      { taskId: target.id, sectionId: null, sortOrder: 1000 },
    ]);

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.sectionId).toBeNull(); // 未分類へ戻る
    expect(after.endedAt).toEqual(endedAt);
  });
});
