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
        renumber: null,
      },
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
          renumber: null,
        },
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toBeNull();
    expect(after.find((t) => t.id === target.id)?.startedAt).toBeNull();
    expect(after).toHaveLength(2);
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
      renumber: null,
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

describe("ルーチン由来タスクの削除とスキップ（F-304 / データモデル定義書 §3.6）", () => {
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
      relocation: [{ taskId: target.id, sectionId: night.id, sortOrder: 1000 }],
    });

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt);
    expect(after.sectionId).toBe(night.id);
  });
});
