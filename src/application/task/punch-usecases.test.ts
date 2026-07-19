import { describe, expect, it } from "vitest";
import { taskStatus } from "@/domain/task/status";
import type { Task } from "@/domain/task/task";
import { finishTask, startTask } from "./punch-usecases";
import { inMemoryTaskRepository } from "./testing/in-memory-task-repository";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 30,
    sectionId: 1,
    modeId: null,
    projectId: null,
    sortOrder: over.id * 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

const now = new Date("2026-07-19T09:00:00Z");

describe("startTask（F-201: 開始打刻）", () => {
  it("実行中タスクがなければそのまま開始する", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1 })]);
    expect((await startTask(repo, { taskId: 1, now })).ok).toBe(true);
    expect(repo.rows[0].startedAt).toEqual(now);
  });

  it("実行中・完了タスクは開始できない", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt: now })]);
    expect(await startTask(repo, { taskId: 1, now })).toEqual({
      ok: false,
      error: "already_started",
    });
  });

  it("存在しないタスクはエラー", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(await startTask(repo, { taskId: 99, now })).toEqual({
      ok: false,
      error: "task_not_found",
    });
  });
});

describe("startTask の割り込み（F-201 / データモデル定義書 §4.2）", () => {
  const startedAt = new Date("2026-07-19T08:48:00Z"); // 実績12分になる

  it("実行中タスクを同じ時刻で終了し、開始タスクの直下に再開タスクを作る", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, name: "メールチェック", estimateMinutes: 30, startedAt, sortOrder: 1000 }),
      task({ id: 2, name: "設計書レビュー", sortOrder: 2000 }),
      task({ id: 3, name: "後続タスク", sortOrder: 3000 }),
    ]);

    expect((await startTask(repo, { taskId: 2, now })).ok).toBe(true);

    const [interrupted, started, , resumed] = repo.rows;
    expect(interrupted.endedAt).toEqual(now); // ①終了
    expect(started.startedAt).toEqual(now); // ③開始
    expect(resumed).toEqual(
      expect.objectContaining({
        name: "メールチェック",
        estimateMinutes: 18, // max(30 − 12, 1)
        splitParentId: 1,
        sortOrder: 2500, // 開始タスク(2000)と後続(3000)の中間 = 直下
        startedAt: null,
      })
    );
  });

  it("再開タスクは開始タスクのセクション・日付に従う（前日の実行中タスクを割り込んだ場合も当日側）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, taskDate: "2026-07-18", sectionId: 9, startedAt, sortOrder: 1000 }),
      task({ id: 2, taskDate: "2026-07-19", sectionId: 3, sortOrder: 5000 }),
    ]);

    await startTask(repo, { taskId: 2, now });

    const resumed = repo.rows[2];
    expect([resumed.taskDate, resumed.sectionId, resumed.sortOrder]).toEqual([
      "2026-07-19",
      3,
      6000, // 後続がないので開始タスクの +1000
    ]);
    expect(repo.rows[0].endedAt).toEqual(now);
  });

  it("見積もり未設定の実行中タスクは、再開タスクも未設定のまま（2026-07-19 オーナー判断）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, estimateMinutes: 0, startedAt, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 2000 }),
    ]);

    await startTask(repo, { taskId: 2, now });
    expect(repo.rows[2].estimateMinutes).toBe(0);
  });

  it("割り込み後も実行中タスクは全体で1件だけ", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, startedAt, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 2000 }),
    ]);

    await startTask(repo, { taskId: 2, now });
    expect(repo.rows.filter((t) => taskStatus(t) === "running").map((t) => t.id)).toEqual([2]);
  });
});

describe("finishTask（F-201: 終了打刻）", () => {
  it("実行中タスクを終了する", async () => {
    const startedAt = new Date("2026-07-19T08:30:00Z");
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt })]);

    expect((await finishTask(repo, { taskId: 1, now })).ok).toBe(true);
    expect(repo.rows[0].endedAt).toEqual(now);
  });

  it("未実行タスクは終了できない", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1 })]);
    expect(await finishTask(repo, { taskId: 1, now })).toEqual({
      ok: false,
      error: "not_running",
    });
  });

  it("開始より前の時刻では終了できない（開始 ≦ 終了）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, startedAt: new Date("2026-07-19T09:30:00Z") }),
    ]);
    expect(await finishTask(repo, { taskId: 1, now })).toEqual({
      ok: false,
      error: "ended_before_started",
    });
  });
});
