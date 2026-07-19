import { describe, expect, it } from "vitest";
import { actualMinutes, elapsedMinutes, type Task } from "./task";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: "メールチェック",
    estimateMinutes: 30,
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
    ...over,
  };
}

const startedAt = new Date("2026-07-19T08:00:00Z");

describe("actualMinutes（データモデル定義書 §3.5: 実績 = ended_at − started_at）", () => {
  it("完了タスクの実績を分で返す", () => {
    const t = task({ id: 1, startedAt, endedAt: new Date("2026-07-19T08:18:00Z") });
    expect(actualMinutes(t)).toBe(18);
  });

  it("1分未満は0分に丸める（表示は 0:00。--:-- にはしない）", () => {
    const t = task({ id: 1, startedAt, endedAt: new Date("2026-07-19T08:00:20Z") });
    expect(actualMinutes(t)).toBe(0);
  });

  it("未実行・実行中は実績を持たない", () => {
    expect(actualMinutes(task({ id: 1 }))).toBeNull();
    expect(actualMinutes(task({ id: 1, startedAt }))).toBeNull();
  });
});

describe("elapsedMinutes（F-205: 実行中タスクの経過時間）", () => {
  it("実行中タスクの経過を現在時刻から求める", () => {
    const t = task({ id: 1, startedAt });
    expect(elapsedMinutes(t, new Date("2026-07-19T08:12:00Z"))).toBe(12);
  });

  it("未実行・完了タスクは経過を持たない", () => {
    expect(elapsedMinutes(task({ id: 1 }), new Date())).toBeNull();
    expect(
      elapsedMinutes(task({ id: 1, startedAt, endedAt: new Date("2026-07-19T08:30:00Z") }), new Date())
    ).toBeNull();
  });
});
