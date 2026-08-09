import { describe, expect, it } from "vitest";
import {
  canFinish,
  canStart,
  canUndoComplete,
  canUndoStart,
  resumeTaskDraft,
} from "./punch";
import { task } from "./testing/task";

const startedAt = new Date("2026-07-26T08:00:00Z");

describe("resumeTaskDraft（F-204: 「（再開）」を付けた同属性の再開タスクを生成）", () => {
  describe("残り見積もり（データモデル定義書 §4.2）", () => {
    /** 見積もり `estimate` 分のタスクを `actual` 分やって中断したときの、再開タスクの見積もり */
    const remainingEstimate = (estimate: number, actual: number) =>
      resumeTaskDraft(
        task({ id: 1, estimateMinutes: estimate, startedAt }),
        new Date(startedAt.getTime() + actual * 60_000)
      ).estimateMinutes;

    it("見積もり − 実績 を残り見積もりにする", () => {
      expect(remainingEstimate(30, 12)).toBe(18);
    });

    it("実績が見積もりを超えていても最低1分は残す", () => {
      expect(remainingEstimate(30, 45)).toBe(1);
      expect(remainingEstimate(30, 30)).toBe(1);
    });

    it("元が未設定（0分）なら未設定のまま引き継ぐ（2026-07-19 オーナー判断）", () => {
      expect(remainingEstimate(0, 20)).toBe(0);
    });

    // 実際には実行中タスクしか渡らない（実績が算出できない枝の防御）。引くものが無いので
    // 見積もりがそのまま残る
    it("開始していないタスクからは見積もりをそのまま引き継ぐ", () => {
      const notStarted = task({ id: 1, estimateMinutes: 30 });
      expect(resumeTaskDraft(notStarted, startedAt).estimateMinutes).toBe(30);
    });
  });

  it("名前に「（再開）」を付け、モード・プロジェクトを引き継ぎ、split_parent_id で元タスクへ紐づける", () => {
    const original = task({
      id: 7,
      name: "メールチェック",
      estimateMinutes: 30,
      modeId: 2,
      projectId: 3,
      startedAt,
    });
    const endedAt = new Date("2026-07-26T08:12:00Z"); // 実績12分

    expect(resumeTaskDraft(original, endedAt)).toEqual({
      name: "メールチェック（再開）",
      estimateMinutes: 18,
      modeId: 2,
      projectId: 3,
      highlighted: false,
      splitParentId: 7,
    });
  });

  // データモデル定義書 §4.2: 既に付いていても足す（何度目の再開かは行の並びで読む）
  it("再開タスクをさらに中断すると「（再開）」が積み上がる", () => {
    const resumed = task({ id: 7, name: "メールチェック（再開）", startedAt });
    expect(resumeTaskDraft(resumed, new Date("2026-07-26T08:12:00Z")).name).toBe(
      "メールチェック（再開）（再開）"
    );
  });

  // F-118: 再開タスクは「同じ仕事の続き」なのでハイライトを引き継ぐ（データモデル定義書 §4.2）
  it("ハイライトを引き継ぐ", () => {
    const original = task({ id: 7, highlighted: true, startedAt });
    expect(resumeTaskDraft(original, new Date("2026-07-26T08:10:00Z")).highlighted).toBe(true);
  });

  it("ハイライトされていない元タスクからは引き継がない", () => {
    const original = task({ id: 7, highlighted: false, startedAt });
    expect(resumeTaskDraft(original, new Date("2026-07-26T08:10:00Z")).highlighted).toBe(false);
  });

  it("ルーチン由来でも routine_id は引き継がない（展開の冪等制約に抵触するため）", () => {
    const original = task({ id: 7, routineId: 99, startedAt });
    const draft = resumeTaskDraft(original, new Date("2026-07-26T08:10:00Z"));
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
      canStart(task({ id: 1, startedAt, endedAt: new Date("2026-07-26T08:30:00Z") }))
    ).toEqual({ ok: false, error: "already_started" });
  });
});

describe("canFinish（F-201/F-204: 終了・中断は実行中タスクのみ）", () => {
  it("実行中タスクは終了できる", () => {
    expect(canFinish(task({ id: 1, startedAt }), new Date("2026-07-26T08:30:00Z")).ok).toBe(true);
  });

  it("未実行タスクは終了できない", () => {
    expect(canFinish(task({ id: 1 }), new Date())).toEqual({ ok: false, error: "not_running" });
  });

  it("開始より前の時刻では終了できない（開始 ≦ 終了）", () => {
    expect(canFinish(task({ id: 1, startedAt }), new Date("2026-07-26T07:59:00Z"))).toEqual({
      ok: false,
      error: "ended_before_started",
    });
  });
});

describe("canUndoStart（F-210: 開始を取り消せるのは実行中タスクのみ）", () => {
  it("実行中タスクは開始を取り消せる", () => {
    expect(canUndoStart(task({ id: 1, startedAt })).ok).toBe(true);
  });

  it("未実行タスクは取り消せない", () => {
    expect(canUndoStart(task({ id: 1 }))).toEqual({ ok: false, error: "not_running" });
  });

  it("完了タスクは対象外", () => {
    expect(
      canUndoStart(task({ id: 1, startedAt, endedAt: new Date("2026-07-26T08:30:00Z") }))
    ).toEqual({ ok: false, error: "not_running" });
  });
});

describe("canUndoComplete（F-212: 完了を取り消せるのは完了タスクのみ）", () => {
  const endedAt = new Date("2026-07-26T08:30:00Z");

  it("完了タスクは完了を取り消せる（打刻2列を絞り込んだタスクをそのまま返す）", () => {
    // 戻り値は復帰用スナップショット（§4.7）の元データになるので、列の取りこぼしがないことを固定する
    const completed = task({ id: 1, startedAt, endedAt });
    expect(canUndoComplete(completed)).toEqual({ ok: true, value: completed });
  });

  it("未実行タスクは取り消せない", () => {
    expect(canUndoComplete(task({ id: 1 }))).toEqual({ ok: false, error: "not_completed" });
  });

  it("実行中タスクは対象外（開始の取り消しが受け持つ）", () => {
    expect(canUndoComplete(task({ id: 1, startedAt }))).toEqual({
      ok: false,
      error: "not_completed",
    });
  });
});
