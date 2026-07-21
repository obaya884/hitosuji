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

  it("1分未満は常に0分（切り捨て。画面定義書01 §3.3: 表示は 0:00）", () => {
    const short = task({ id: 1, startedAt, endedAt: new Date("2026-07-19T08:00:20Z") });
    expect(actualMinutes(short)).toBe(0);

    // 45秒は四捨五入だと1分になってしまうため、切り捨てであることを固定する
    const almostAMinute = task({ id: 1, startedAt, endedAt: new Date("2026-07-19T08:00:45Z") });
    expect(actualMinutes(almostAMinute)).toBe(0);
  });

  it("端数は切り捨てる（1分59秒は1分）", () => {
    const t = task({ id: 1, startedAt, endedAt: new Date("2026-07-19T08:01:59Z") });
    expect(actualMinutes(t)).toBe(1);
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

  it("経過も端数は切り捨てる（開始直後は0分）", () => {
    const t = task({ id: 1, startedAt });
    expect(elapsedMinutes(t, new Date("2026-07-19T08:00:45Z"))).toBe(0);
  });

  it("現在時刻が開始時刻より前でも負値ではなく0を返す（FB-28: クライアント時計のズレ対策）", () => {
    const t = task({ id: 1, startedAt });
    expect(elapsedMinutes(t, new Date("2026-07-19T07:59:30Z"))).toBe(0);
  });

  it("未実行・完了タスクは経過を持たない", () => {
    expect(elapsedMinutes(task({ id: 1 }), new Date())).toBeNull();
    expect(
      elapsedMinutes(task({ id: 1, startedAt, endedAt: new Date("2026-07-19T08:30:00Z") }), new Date())
    ).toBeNull();
  });
});
