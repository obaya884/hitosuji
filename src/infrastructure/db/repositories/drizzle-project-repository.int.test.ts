import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { routines, tasks } from "@/infrastructure/db/schema";
import { createTestDb, truncateAll } from "@/infrastructure/db/testing/test-db";
import { createProjectRepository } from "./drizzle-project-repository";

const { db, pool } = createTestDb();
const repo = createProjectRepository(db);

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("DrizzleProjectRepository", () => {
  it("作成・一覧・更新・アーカイブが往復する", async () => {
    const created = await repo.create({ name: "引越し" });
    expect(created).toEqual({ id: expect.any(Number), name: "引越し", isArchived: false });

    await repo.update(created.id, { name: "01.引越し" });
    await repo.setArchived(created.id, true);

    expect(await repo.listAll()).toEqual([
      { id: created.id, name: "01.引越し", isArchived: true },
    ]);
  });

  it("アーカイブ済みも listAll に含まれる（復元できるようにするため）", async () => {
    const a = await repo.create({ name: "A" });
    await repo.create({ name: "B" });
    await repo.setArchived(a.id, true);
    expect(await repo.listAll()).toHaveLength(2);
  });

  // 画面定義書03 §4.1
  it("タスクとルーチンの参照をどちらも数え、参照0件のプロジェクトは削除できる", async () => {
    const used = await repo.create({ name: "使用中" });
    const unused = await repo.create({ name: "誤作成" });

    await db
      .insert(tasks)
      .values({ taskDate: "2026-07-20", name: "T1", sortOrder: 1000, projectId: used.id });
    await db.insert(routines).values({
      name: "R1",
      estimateMinutes: 10,
      scheduledStartTime: "06:30",
      recurrenceType: "daily",
      startDate: "2026-07-20",
      projectId: used.id,
    });

    expect(await repo.referenceCounts([used.id, unused.id])).toEqual({ [used.id]: 2 });

    await repo.remove(unused.id);
    expect((await repo.listAll()).map((p) => p.id)).toEqual([used.id]);
  });
});
