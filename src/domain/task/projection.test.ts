import { describe, expect, it } from "vitest";
import {
  formatProjectedEnd,
  isOverMidnight,
  projectedEndTime,
  remainingMinutes,
  sectionCapacityMinutes,
  sectionEndAt,
  sectionRemainingMinutes,
} from "./projection";
import type { Task } from "./task";

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

// ローカル時刻で構築する
function at(hours: number, minutes: number): Date {
  return new Date(2026, 6, 19, hours, minutes, 0, 0);
}

describe("remainingMinutes（F-104 / データモデル定義書 §4.3）", () => {
  it("未実行タスクの見積もりを合計する", () => {
    const tasks = [task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 45 })];
    expect(remainingMinutes(tasks, at(9, 0))).toBe(75);
  });

  it("完了タスクは残時間に含めない", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 30, startedAt: at(8, 0), endedAt: at(8, 30) }),
      task({ id: 2, estimateMinutes: 45 }),
    ];
    expect(remainingMinutes(tasks, at(9, 0))).toBe(45);
  });

  it("実行中タスクは「見積もり − 経過」を残りとして加える", () => {
    const tasks = [task({ id: 1, estimateMinutes: 30, startedAt: at(8, 50) })]; // 経過10分
    expect(remainingMinutes(tasks, at(9, 0))).toBe(20);
  });

  it("実行中タスクが見積もりを超過していても残りは0（マイナスにしない）", () => {
    const tasks = [task({ id: 1, estimateMinutes: 10, startedAt: at(8, 0) })]; // 経過60分
    expect(remainingMinutes(tasks, at(9, 0))).toBe(0);
  });

  it("見積もり未設定（0分）は計算に含まれない（画面定義書01 §3.3）", () => {
    const tasks = [task({ id: 1, estimateMinutes: 0 }), task({ id: 2, estimateMinutes: 30 })];
    expect(remainingMinutes(tasks, at(9, 0))).toBe(30);
  });

  it("タスクが0件なら0分", () => {
    expect(remainingMinutes([], at(9, 0))).toBe(0);
  });
});

describe("projectedEndTime（F-104: 現在時刻 + 残時間）", () => {
  it("現在時刻に残時間を足した時刻を返す", () => {
    const tasks = [task({ id: 1, estimateMinutes: 90 })];
    expect(projectedEndTime(tasks, at(9, 0))).toEqual(at(10, 30));
  });
});

describe("formatProjectedEnd（F-104: 24:00超過は翌日表記）", () => {
  it("当日内はそのままの時刻表記", () => {
    expect(formatProjectedEnd(at(21, 45), at(9, 0))).toBe("21:45");
  });

  it("24:00を超えたら 25:30 のように表記する", () => {
    const nextDay = new Date(2026, 6, 20, 1, 30, 0, 0);
    expect(formatProjectedEnd(nextDay, at(22, 0))).toBe("25:30");
  });

  it("ちょうど24:00は 24:00 と表記する", () => {
    const midnight = new Date(2026, 6, 20, 0, 0, 0, 0);
    expect(formatProjectedEnd(midnight, at(22, 0))).toBe("24:00");
  });
});

describe("isOverMidnight（F-104: 警告色の判定）", () => {
  it("当日内なら false", () => {
    expect(isOverMidnight(at(23, 59), at(9, 0))).toBe(false);
  });

  it("24:00以降なら true", () => {
    expect(isOverMidnight(new Date(2026, 6, 20, 0, 0), at(9, 0))).toBe(true);
  });
});

describe("F-116: 折返し表記・超過警告を日界（論理日）基準で測る", () => {
  const DAY_START = 6 * 60; // 日界 06:00

  it("日界 06:00 で翌 03:00 終了は 27:00 表記（暦日ではなく論理日起点）", () => {
    const end = new Date(2026, 6, 20, 3, 0);
    expect(formatProjectedEnd(end, at(23, 0), DAY_START)).toBe("27:00");
  });

  it("日界 06:00 では次の日界（翌 06:00）を越えるまで警告しない", () => {
    expect(isOverMidnight(new Date(2026, 6, 20, 3, 0), at(23, 0), DAY_START)).toBe(false);
    expect(isOverMidnight(new Date(2026, 6, 20, 7, 0), at(23, 0), DAY_START)).toBe(true);
  });

  it("日界より前（深夜帯）の now は論理日が前の暦日になり、起点も前の暦日", () => {
    // 日界 06:00 で now 02:00（論理日は前日）。05:00 終了は前日 0:00 起点で 29:00
    expect(formatProjectedEnd(at(5, 0), at(2, 0), DAY_START)).toBe("29:00");
    expect(isOverMidnight(at(5, 0), at(2, 0), DAY_START)).toBe(false); // 前日の日界=当日06:00までは収まる
    expect(isOverMidnight(at(7, 0), at(2, 0), DAY_START)).toBe(true);
  });

  it("ちょうど次の日界（翌 06:00）で超過＝true。折返し表記は論理日の暦日0:00起点なので 30:00", () => {
    const nextDayStart = new Date(2026, 6, 20, 6, 0); // 07-19 の論理日の終わり = 翌 06:00
    expect(isOverMidnight(nextDayStart, at(23, 0), DAY_START)).toBe(true);
    expect(formatProjectedEnd(nextDayStart, at(23, 0), DAY_START)).toBe("30:00");
  });
});

describe("sectionCapacityMinutes（F-110: セクション枠の長さ）", () => {
  it("開始から終了までの分数を返す", () => {
    expect(sectionCapacityMinutes("06:00", "09:00")).toBe(180);
  });

  it("日をまたぐ枠（夜 18:00–00:00）も正しく求める", () => {
    expect(sectionCapacityMinutes("18:00", "00:00")).toBe(360);
  });

  it("有効セクションが1件で先頭へ折り返す場合は24時間", () => {
    expect(sectionCapacityMinutes("06:00", "06:00")).toBe(24 * 60);
  });
});

describe("sectionEndAt（F-110: セクション終了時刻の絶対時刻）", () => {
  it("基準時刻と同じ暦日の壁時計として終了時刻を返す", () => {
    // 基準 2026-07-19 09:00、終了 12:00 → 同日 12:00
    expect(sectionEndAt(at(9, 0), "09:00", "12:00").getTime()).toBe(at(12, 0).getTime());
  });

  it("日をまたぐ枠（終了 ≤ 開始）は翌日へずらす", () => {
    // 夜 18:00–00:00 は基準日翌日の 0:00
    const end = sectionEndAt(at(20, 0), "18:00", "00:00");
    expect(end.getTime()).toBe(new Date(2026, 6, 20, 0, 0).getTime());
  });

  it("開始=終了（1件で先頭へ折り返す枠）は翌日の同時刻", () => {
    const end = sectionEndAt(at(8, 0), "06:00", "06:00");
    expect(end.getTime()).toBe(new Date(2026, 6, 20, 6, 0).getTime());
  });

  it("日界 06:00 のとき、回転で末尾に来る深夜(00:00–06:00)は翌暦日に敷かれる（F-116）", () => {
    // now 07-19 20:00、日界 06:00。深夜は論理日の末尾＝翌 00:00–06:00
    const end = sectionEndAt(at(20, 0), "00:00", "06:00", 6 * 60);
    expect(end.getTime()).toBe(new Date(2026, 6, 20, 6, 0).getTime());
  });

  it("日界 06:00 の日界セクション（朝 06:00–09:00）は当日 09:00 で終わる（F-116）", () => {
    const end = sectionEndAt(at(20, 0), "06:00", "09:00", 6 * 60);
    expect(end.getTime()).toBe(new Date(2026, 6, 19, 9, 0).getTime());
  });

  it("日界より前（深夜帯）の now では、深夜枠は翌暦日ではなく直近の日界で閉じる（F-116）", () => {
    // now 07-19 02:00・日界 06:00 → 論理日は 07-18。深夜(00:00–06:00)の終わりは当日(07-19) 06:00
    const end = sectionEndAt(at(2, 0), "00:00", "06:00", 6 * 60);
    expect(end.getTime()).toBe(new Date(2026, 6, 19, 6, 0).getTime());
  });
});

describe("sectionRemainingMinutes（F-110: セクションの残り時間 / データモデル定義書 §4.3）", () => {
  // セクション終了 12:00、現在 9:00（終了まで180分）
  const end = at(12, 0);

  it("(終了まで − 未完了見積もり) を返す。余りはプラス", () => {
    const tasks = [task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 45 })];
    // 180 − 75 = 105
    expect(sectionRemainingMinutes(end, tasks, at(9, 0))).toBe(105);
  });

  it("未完了見積もりが終了までを超えると残りはマイナス（枠に収まらない）", () => {
    const tasks = [task({ id: 1, estimateMinutes: 120 }), task({ id: 2, estimateMinutes: 120 })];
    // 180 − 240 = -60
    expect(sectionRemainingMinutes(end, tasks, at(9, 0))).toBe(-60);
  });

  it("完了タスクは未完了見積もりに含めない", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 60, startedAt: at(8, 0), endedAt: at(8, 40) }),
      task({ id: 2, estimateMinutes: 45 }),
    ];
    // 180 − 45 = 135
    expect(sectionRemainingMinutes(end, tasks, at(9, 0))).toBe(135);
  });

  it("実行中タスクは残り見積もり（見積もり − 経過）で算入する", () => {
    const tasks = [task({ id: 1, estimateMinutes: 30, startedAt: at(8, 50) })]; // 経過10分・残り20分
    // 180 − 20 = 160
    expect(sectionRemainingMinutes(end, tasks, at(9, 0))).toBe(160);
  });
});
