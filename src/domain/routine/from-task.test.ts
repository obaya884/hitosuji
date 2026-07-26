import { describe, expect, it } from "vitest";
import { task } from "../task/testing/task";
import {
  defaultChoiceFromTask,
  routineEstimateFromTask,
  routineInputFromTask,
  type RoutineFromTaskChoice,
} from "./from-task";

const choice: RoutineFromTaskChoice = {
  recurrenceType: "daily",
  weekdays: null,
  weekInterval: null,
  monthDay: null,
  intervalDays: null,
  scheduledStartTime: "06:30",
};

describe("routineEstimateFromTask（画面定義書01 §4.1: 見積もり0分（未設定）の扱い）", () => {
  it("見積もりが設定済みならそれを使う", () => {
    const t = task({ id: 1, estimateMinutes: 45 });
    const result = routineEstimateFromTask(t);
    expect(result).toEqual({ ok: true, value: 45 });
  });

  it("見積もり0分のタスクは実績を見積もりに転用する", () => {
    const t = task({
      id: 1,
      estimateMinutes: 0,
      startedAt: new Date("2026-07-26T08:00:00Z"),
      endedAt: new Date("2026-07-26T08:15:00Z"),
    });
    const result = routineEstimateFromTask(t);
    expect(result).toEqual({ ok: true, value: 15 });
  });

  it("実績が1分未満に丸まる場合は最低1分にする（ルーチンは1分以上必須）", () => {
    const t = task({
      id: 1,
      estimateMinutes: 0,
      startedAt: new Date("2026-07-26T08:00:00Z"),
      endedAt: new Date("2026-07-26T08:00:30Z"), // 実績30秒
    });
    const result = routineEstimateFromTask(t);
    expect(result).toEqual({ ok: true, value: 1 });
  });

  it("未実行かつ見積もり0分（実績もない）場合はエラー", () => {
    const t = task({ id: 1, estimateMinutes: 0 });
    const result = routineEstimateFromTask(t);
    expect(result).toEqual({ ok: false, error: "estimate_required" });
  });

  it("実行中（未終了）かつ見積もり0分の場合も実績が確定していないためエラー", () => {
    const t = task({
      id: 1,
      estimateMinutes: 0,
      startedAt: new Date("2026-07-26T08:00:00Z"),
    });
    const result = routineEstimateFromTask(t);
    expect(result).toEqual({ ok: false, error: "estimate_required" });
  });
});

describe("routineInputFromTask（画面定義書01 §4.1: 引き継ぐ値・開始日・終了日）", () => {
  it("名前・見積もり・モード・プロジェクトを引き継ぎ、開始日は翌日、終了日はなし", () => {
    const t = task({ id: 1, name: "朝食", estimateMinutes: 20, modeId: 2, projectId: 3 });
    const result = routineInputFromTask(t, choice);
    expect(result).toEqual({
      ok: true,
      value: {
        name: "朝食",
        estimateMinutes: 20,
        scheduledStartTime: "06:30",
        modeId: 2,
        projectId: 3,
        recurrenceType: "daily",
        weekdays: null,
        weekInterval: null,
        monthDay: null,
        intervalDays: null,
        startDate: "2026-07-27", // TEST_DATE（07-26）の翌日
        endDate: null,
      },
    });
  });

  it("routine_id・split_parent_id・コメントは RoutineInput に含まれない", () => {
    // 見積もりは通す値（0 だと estimate_required で手前で落ちる）
    const t = task({
      id: 1,
      estimateMinutes: 30,
      routineId: null,
      splitParentId: 9,
      comment: "メモ",
    });
    const result = routineInputFromTask(t, choice);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty("splitParentId");
      expect(result.value).not.toHaveProperty("comment");
      expect(result.value).not.toHaveProperty("routineId");
    }
  });

  it("見積もり0分・実績もないタスクはエラーで作成できない", () => {
    const t = task({ id: 1, estimateMinutes: 0 });
    const result = routineInputFromTask(t, choice);
    expect(result).toEqual({ ok: false, error: "estimate_required" });
  });

  it("ルーチン由来タスク（routine_id あり）からは作成できない", () => {
    // 見積もりは通る値にする（0 だと下の「優先する」テストと同じ入力になり、両者が別物を
    // 主張しなくなる）
    const t = task({ id: 1, routineId: 5, estimateMinutes: 30 });
    const result = routineInputFromTask(t, choice);
    expect(result).toEqual({ ok: false, error: "routine_derived_task" });
  });

  it("ルーチン由来タスクの判定は見積もりチェックより優先する", () => {
    const t = task({ id: 1, routineId: 5, estimateMinutes: 0 });
    const result = routineInputFromTask(t, choice);
    expect(result).toEqual({ ok: false, error: "routine_derived_task" });
  });

  it("ポップオーバーで選んだ繰り返し設定（週次の曜日など）をそのまま使う", () => {
    const t = task({ id: 1, estimateMinutes: 30 });
    const weeklyChoice: RoutineFromTaskChoice = {
      recurrenceType: "weekly",
      weekdays: 0b0010101, // 月・水・金
      weekInterval: 2, // 隔週（FB-44。ルーチン化からも週間隔を選べる）
      monthDay: null,
      intervalDays: null,
      scheduledStartTime: "10:00",
    };
    const result = routineInputFromTask(t, weeklyChoice);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recurrenceType).toBe("weekly");
      expect(result.value.weekdays).toBe(0b0010101);
      expect(result.value.weekInterval).toBe(2);
      expect(result.value.scheduledStartTime).toBe("10:00");
    }
  });
});

describe("defaultChoiceFromTask（画面定義書01 §4.1: ポップオーバーの既定値）", () => {
  it("繰り返し種別の既定は「毎日」で、開始想定時刻は呼び出し側の値をそのまま使う", () => {
    const t = task({ id: 1 });
    const result = defaultChoiceFromTask(t, "06:30");
    expect(result.recurrenceType).toBe("daily");
    expect(result.scheduledStartTime).toBe("06:30");
  });

  it("週次の曜日の既定は元タスクの task_date の曜日（日曜 → bit6）", () => {
    const t = task({ id: 1 }); // TEST_DATE（2026-07-26）は日曜
    const result = defaultChoiceFromTask(t, "06:30");
    expect(result.weekdays).toBe(1 << 6);
  });

  it("週次の曜日の既定は元タスクの task_date の曜日（月曜 → bit0）", () => {
    const t = task({ id: 1, taskDate: "2026-07-27" }); // 月曜
    const result = defaultChoiceFromTask(t, "06:30");
    expect(result.weekdays).toBe(1 << 0);
  });

  it("月次の日の既定は元タスクの task_date の日", () => {
    const t = task({ id: 1, taskDate: "2026-07-19" });
    const result = defaultChoiceFromTask(t, "06:30");
    expect(result.monthDay).toBe(19); // 基準日（26日）と別の日を使い、日の引き継ぎが効いていることを見る
  });

  it("月末日（31日）でもそのまま日を引き継ぐ", () => {
    const t = task({ id: 1, taskDate: "2026-01-31" }); // 土曜・月末
    const result = defaultChoiceFromTask(t, "06:30");
    expect(result.monthDay).toBe(31);
    expect(result.weekdays).toBe(1 << 5); // 土 = bit5
  });

  it("n日ごとの間隔の既定は2日", () => {
    const t = task({ id: 1 });
    const result = defaultChoiceFromTask(t, "06:30");
    expect(result.intervalDays).toBe(2);
  });
});
