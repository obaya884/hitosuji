import { describe, expect, it } from "vitest";
import { canFinish, canStart, resumeEstimateMinutes, resumeTaskDraft } from "./punch";
import type { Task } from "./task";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: "メールチェック",
    estimateMinutes: 30,
    sectionId: 1,
    modeId: 2,
    projectId: 3,
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

describe("resumeEstimateMinutes（データモデル定義書 §4.2: 再開タスクの見積もり）", () => {
  it("見積もり − 実績 を残り見積もりにする", () => {
    expect(resumeEstimateMinutes(task({ id: 1, estimateMinutes: 30 }), 12)).toBe(18);
  });

  it("実績が見積もりを超えていても最低1分は残す", () => {
    expect(resumeEstimateMinutes(task({ id: 1, estimateMinutes: 30 }), 45)).toBe(1);
    expect(resumeEstimateMinutes(task({ id: 1, estimateMinutes: 30 }), 30)).toBe(1);
  });

  it("元が未設定（0分）なら未設定のまま引き継ぐ（2026-07-19 オーナー判断）", () => {
    expect(resumeEstimateMinutes(task({ id: 1, estimateMinutes: 0 }), 20)).toBe(0);
  });
});

describe("resumeTaskDraft（F-204: 同名・同属性の再開タスクを生成）", () => {
  it("名前・モード・プロジェクトを引き継ぎ、split_parent_id で元タスクへ紐づける", () => {
    const original = task({ id: 7, estimateMinutes: 30, startedAt });
    const endedAt = new Date("2026-07-19T08:12:00Z"); // 実績12分

    expect(resumeTaskDraft(original, endedAt)).toEqual({
      name: "メールチェック",
      estimateMinutes: 18,
      modeId: 2,
      projectId: 3,
      splitParentId: 7,
    });
  });

  it("ルーチン由来でも routine_id は引き継がない（展開の冪等制約に抵触するため）", () => {
    const original = task({ id: 7, routineId: 99, startedAt });
    const draft = resumeTaskDraft(original, new Date("2026-07-19T08:10:00Z"));
    expect(draft).not.toHaveProperty("routineId");
  });
});

describe("canStart（F-201: 開始できるのは未実行タスクのみ）", () => {
  it("未実行タスクは開始できる", () => {
    expect(canStart(task({ id: 1 })).ok).toBe(true);
  });

  it("実行中・完了タスクは開始できない", () => {
    expect(canStart(task({ id: 1, startedAt }))).toEqual({ ok: false, error: "already_started" });
    expect(
      canStart(task({ id: 1, startedAt, endedAt: new Date("2026-07-19T08:30:00Z") }))
    ).toEqual({ ok: false, error: "already_started" });
  });
});

describe("canFinish（F-201/F-204: 終了・中断は実行中タスクのみ）", () => {
  it("実行中タスクは終了できる", () => {
    expect(canFinish(task({ id: 1, startedAt }), new Date("2026-07-19T08:30:00Z")).ok).toBe(true);
  });

  it("未実行タスクは終了できない", () => {
    expect(canFinish(task({ id: 1 }), new Date())).toEqual({ ok: false, error: "not_running" });
  });

  it("開始より前の時刻では終了できない（開始 ≦ 終了）", () => {
    expect(canFinish(task({ id: 1, startedAt }), new Date("2026-07-19T07:59:00Z"))).toEqual({
      ok: false,
      error: "ended_before_started",
    });
  });
});
