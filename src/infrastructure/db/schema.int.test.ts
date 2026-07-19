import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sections, tasks } from "./schema";
import { createTestDb, truncateAll } from "./testing/test-db";

const { db, pool } = createTestDb();

// drizzle は DB エラーをラップし制約名は cause に入るため、cause まで見て判定する
function rejectsWithConstraint(p: Promise<unknown>, constraint: string) {
  return expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof Error && String(e.cause).includes(constraint)
  );
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("sections — uq_sections_start_time_active（部分ユニーク）", () => {
  it("有効セクション同士の start_time 重複は拒否される", async () => {
    await db.insert(sections).values({ name: "朝", startTime: "06:00" });
    await rejectsWithConstraint(
      db.insert(sections).values({ name: "早朝", startTime: "06:00" }),
      "uq_sections_start_time_active"
    );
  });

  it("アーカイブ済みセクションとの start_time 重複は許容される", async () => {
    await db
      .insert(sections)
      .values({ name: "旧朝", startTime: "06:00", isArchived: true });
    await db.insert(sections).values({ name: "朝", startTime: "06:00" });
    expect(await db.select().from(sections)).toHaveLength(2);
  });
});

describe("tasks — ck_tasks_time（打刻の整合性 CHECK）", () => {
  it("開始打刻なしの終了打刻は拒否される", async () => {
    await rejectsWithConstraint(
      db.insert(tasks).values({
        taskDate: "2026-07-19",
        name: "不正タスク",
        sortOrder: 1000,
        endedAt: new Date(),
      }),
      "ck_tasks_time"
    );
  });
});
