import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sections, tasks } from "@/infrastructure/db/schema";
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

    await repo.delete(target.id);
    expect(await repo.listByDate("2026-07-19")).toHaveLength(0);

    const { id, ...rest } = { ...target, taskDate: "2026-07-19" };
    void id;
    await repo.restore({ ...rest, startedAt, endedAt });

    const restored = await repo.listByDate("2026-07-19");
    expect(restored).toHaveLength(1);
    expect(restored[0]).toEqual(
      expect.objectContaining({ name: "消すタスク", startedAt, endedAt })
    );
  });
});
