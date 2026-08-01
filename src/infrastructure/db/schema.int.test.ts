import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MODE_COLOR_BY_NAME } from "@/domain/mode/mode";
import { modes, projects, routines, sections, tasks } from "./schema";
import { createTestDb, truncateAll } from "./testing/test-db";

const { db, pool } = createTestDb();

/**
 * routines の NOT NULL 列を埋めた**挿入行**。検証したい列だけを `over` で上書きする。
 * ドメインのビルダー（`domain/routine/testing/routine.ts`）と別物なのは、型で表せない値
 * （規定外の種別・範囲外の週間隔）を DB へ渡して制約の側を試すため
 */
function routineRow(over: Partial<typeof routines.$inferInsert> = {}): typeof routines.$inferInsert {
  return {
    name: "朝食",
    estimateMinutes: 20,
    scheduledStartTime: "06:30",
    recurrenceType: "daily",
    startDate: "2026-07-19",
    ...over,
  };
}

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
  const startedAt = new Date("2026-07-19T09:00:00Z");

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

  it("終了が開始より前の打刻は拒否される", async () => {
    await rejectsWithConstraint(
      db.insert(tasks).values({
        taskDate: "2026-07-19",
        name: "逆順タスク",
        sortOrder: 1000,
        startedAt,
        endedAt: new Date(startedAt.getTime() - 60_000),
      }),
      "ck_tasks_time"
    );
  });

  // 制約は `>=` なので同時刻は通る。押し間違いの即終了で落ちては困るし、
  // 画面定義書01 §3.3「1分未満の実績は `0:00`」も打刻が保存できることが前提
  it("終了と開始が同時刻の打刻は許容される", async () => {
    await db.insert(tasks).values({
      taskDate: "2026-07-19",
      name: "即終了タスク",
      sortOrder: 1000,
      startedAt,
      endedAt: startedAt,
    });
    expect(await db.select().from(tasks)).toHaveLength(1);
  });
});

describe("routines — ck_routines_recurrence_type（繰り返し種別の CHECK）", () => {
  it("規定の4種は許容される", async () => {
    await db
      .insert(routines)
      .values([
        routineRow({ recurrenceType: "daily" }),
        routineRow({ recurrenceType: "weekly", weekdays: 0b0000001 }),
        routineRow({ recurrenceType: "monthly", monthDay: 25 }),
        routineRow({ recurrenceType: "interval", intervalDays: 3 }),
      ]);
    expect(await db.select().from(routines)).toHaveLength(4);
  });

  it("規定外の種別は拒否される", async () => {
    await rejectsWithConstraint(
      db.insert(routines).values(routineRow({ recurrenceType: "yearly" })),
      "ck_routines_recurrence_type"
    );
  });
});

// 隔週（FB-44）。1〜53 は「毎週」から「年1回相当」までを覆う範囲
describe("routines — ck_routines_week_interval（週間隔の CHECK）", () => {
  /** 週間隔が意味を持つのは weekly なので、この節の行はすべて weekly で組む */
  const weekly = (weekInterval: number | null) =>
    routineRow({ recurrenceType: "weekly", weekdays: 0b0000001, weekInterval });

  // CHECK 式が NULL に評価されると PostgreSQL は満たされた扱いにするため、DDL から
  // `week_interval IS NULL OR` を落としてもこのテストは落ちない。主張は分岐の有無ではなく
  // 「毎週（NULL）が保存できる」こと
  it("NULL は許容される（毎週）", async () => {
    await db.insert(routines).values(weekly(null));
    expect(await db.select().from(routines)).toHaveLength(1);
  });

  it("下限 1・上限 53 は許容される", async () => {
    await db.insert(routines).values([weekly(1), weekly(53)]);
    expect(await db.select().from(routines)).toHaveLength(2);
  });

  it("下限より小さい 0 は拒否される", async () => {
    await rejectsWithConstraint(
      db.insert(routines).values(weekly(0)),
      "ck_routines_week_interval"
    );
  });

  it("上限を超える 54 は拒否される", async () => {
    await rejectsWithConstraint(
      db.insert(routines).values(weekly(54)),
      "ck_routines_week_interval"
    );
  });
});

// F-405「参照0件のみ物理削除」はアプリ層（`canDeleteMaster`）が守る設計だが、
// そこを素通りした削除を止める最後の砦は FK にある（ON DELETE は no action）
describe("tasks の外部キー（F-405: 参照されているマスタは DB が削除を拒む）", () => {
  it("参照されているセクションは削除できない", async () => {
    const [section] = await db
      .insert(sections)
      .values({ name: "朝", startTime: "06:00" })
      .returning();
    await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, sectionId: section.id });

    await rejectsWithConstraint(
      db.delete(sections).where(eq(sections.id, section.id)),
      "tasks_section_id_sections_id_fk"
    );
  });

  it("参照されているモードは削除できない", async () => {
    const [mode] = await db
      .insert(modes)
      .values({ name: "仕事", color: MODE_COLOR_BY_NAME["青"] })
      .returning();
    await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, modeId: mode.id });

    await rejectsWithConstraint(
      db.delete(modes).where(eq(modes.id, mode.id)),
      "tasks_mode_id_modes_id_fk"
    );
  });

  it("参照されているプロジェクトは削除できない", async () => {
    const [project] = await db.insert(projects).values({ name: "引越し" }).returning();
    await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, projectId: project.id });

    await rejectsWithConstraint(
      db.delete(projects).where(eq(projects.id, project.id)),
      "tasks_project_id_projects_id_fk"
    );
  });

  // 参照整合のもう一方の側。削除を拒む力と対で、宙に浮いた参照を最初から作らせない
  it("存在しないマスタを指すタスクは作れない", async () => {
    const missing = 999999;

    await rejectsWithConstraint(
      db
        .insert(tasks)
        .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, sectionId: missing }),
      "tasks_section_id_sections_id_fk"
    );
    await rejectsWithConstraint(
      db
        .insert(tasks)
        .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, modeId: missing }),
      "tasks_mode_id_modes_id_fk"
    );
    await rejectsWithConstraint(
      db
        .insert(tasks)
        .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, projectId: missing }),
      "tasks_project_id_projects_id_fk"
    );
  });
});
