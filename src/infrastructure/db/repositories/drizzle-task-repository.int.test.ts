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
