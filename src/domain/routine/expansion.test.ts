import { describe, expect, it } from "vitest";
import { occursOn, routinesToExpand } from "./expansion";
import type { Routine } from "./routine";

function routine(over: Partial<Routine> & { id: number }): Routine {
  return {
    name: `R${over.id}`,
    estimateMinutes: 20,
    scheduledStartTime: "06:30",
    modeId: null,
    projectId: null,
    recurrenceType: "daily",
    weekdays: null,
    monthDay: null,
    intervalDays: null,
    startDate: "2026-01-01",
    endDate: null,
    isActive: true,
    ...over,
  };
}

// 2026-07-19 は日曜、07-20 は月曜
const SUNDAY = "2026-07-19";
const MONDAY = "2026-07-20";

describe("occursOn — daily（データモデル定義書 §4.1-1）", () => {
  it("期間内なら常に該当する", () => {
    expect(occursOn(routine({ id: 1 }), SUNDAY)).toBe(true);
  });
});

describe("occursOn — weekly（曜日ビットマスク bit0=月 … bit6=日）", () => {
  it("指定した曜日に該当する", () => {
    const monday = routine({ id: 1, recurrenceType: "weekly", weekdays: 0b0000001 });
    expect(occursOn(monday, MONDAY)).toBe(true);
    expect(occursOn(monday, SUNDAY)).toBe(false);
  });

  it("日曜は bit6 で表す", () => {
    const sunday = routine({ id: 1, recurrenceType: "weekly", weekdays: 0b1000000 });
    expect(occursOn(sunday, SUNDAY)).toBe(true);
    expect(occursOn(sunday, MONDAY)).toBe(false);
  });

  it("複数曜日を指定できる（月・水・金）", () => {
    const mwf = routine({ id: 1, recurrenceType: "weekly", weekdays: 0b0010101 });
    expect(occursOn(mwf, MONDAY)).toBe(true); // 月
    expect(occursOn(mwf, "2026-07-22")).toBe(true); // 水
    expect(occursOn(mwf, "2026-07-21")).toBe(false); // 火
  });

  it("曜日未設定なら該当しない", () => {
    expect(occursOn(routine({ id: 1, recurrenceType: "weekly", weekdays: null }), MONDAY)).toBe(
      false
    );
  });
});

describe("occursOn — monthly（月末超過は月末に丸める）", () => {
  it("指定日に該当する", () => {
    const r = routine({ id: 1, recurrenceType: "monthly", monthDay: 25 });
    expect(occursOn(r, "2026-07-25")).toBe(true);
    expect(occursOn(r, "2026-07-24")).toBe(false);
  });

  it("31日指定は、31日がない月では月末に丸める", () => {
    const r = routine({ id: 1, recurrenceType: "monthly", monthDay: 31 });
    expect(occursOn(r, "2026-02-28")).toBe(true); // 2月は28日が月末
    expect(occursOn(r, "2026-04-30")).toBe(true); // 4月は30日が月末
    expect(occursOn(r, "2026-07-31")).toBe(true); // 7月は31日がある
  });

  it("うるう年の2月は29日に丸める", () => {
    const r = routine({ id: 1, recurrenceType: "monthly", monthDay: 31 });
    expect(occursOn(r, "2028-02-29")).toBe(true);
    expect(occursOn(r, "2028-02-28")).toBe(false);
  });

  it("monthDay 未設定（マスタ不整合）なら該当しない", () => {
    expect(occursOn(routine({ id: 1, recurrenceType: "monthly", monthDay: null }), "2026-07-25")).toBe(
      false
    );
  });
});

describe("occursOn — interval（start_date を起算日とする n日ごと）", () => {
  it("起算日当日と n日後に該当する", () => {
    const r = routine({
      id: 1,
      recurrenceType: "interval",
      intervalDays: 3,
      startDate: "2026-07-19",
    });
    expect(occursOn(r, "2026-07-19")).toBe(true);
    expect(occursOn(r, "2026-07-22")).toBe(true);
    expect(occursOn(r, "2026-07-20")).toBe(false);
  });

  it("月をまたいでも起算日からの日数で判定する", () => {
    const r = routine({
      id: 1,
      recurrenceType: "interval",
      intervalDays: 10,
      startDate: "2026-07-25",
    });
    expect(occursOn(r, "2026-08-04")).toBe(true);
  });

  it("intervalDays が未設定・0以下（マスタ不整合）なら該当しない", () => {
    const base = { id: 1, recurrenceType: "interval" as const, startDate: "2026-07-19" };
    expect(occursOn(routine({ ...base, intervalDays: null }), "2026-07-19")).toBe(false);
    expect(occursOn(routine({ ...base, intervalDays: 0 }), "2026-07-19")).toBe(false);
  });
});

describe("occursOn — 有効期間と is_active（§4.1-1）", () => {
  it("無効なルーチンは該当しない", () => {
    expect(occursOn(routine({ id: 1, isActive: false }), SUNDAY)).toBe(false);
  });

  it("開始日より前は該当しない", () => {
    expect(occursOn(routine({ id: 1, startDate: "2026-07-20" }), SUNDAY)).toBe(false);
  });

  it("終了日より後は該当しない（終了日当日は該当する）", () => {
    const r = routine({ id: 1, endDate: SUNDAY });
    expect(occursOn(r, SUNDAY)).toBe(true);
    expect(occursOn(r, MONDAY)).toBe(false);
  });
});

describe("routinesToExpand（§4.1-0/2: 過去日は展開しない・生成順）", () => {
  it("過去日は展開しない（過去のログに未実行タスクを混入させない）", () => {
    const routines = [routine({ id: 1 })];
    expect(routinesToExpand(routines, "2026-07-18", SUNDAY)).toEqual([]);
  });

  it("当日は展開する", () => {
    expect(routinesToExpand([routine({ id: 1 })], SUNDAY, SUNDAY)).toHaveLength(1);
  });

  it("未来日は展開する", () => {
    expect(routinesToExpand([routine({ id: 1 })], MONDAY, SUNDAY)).toHaveLength(1);
  });

  it("開始想定時刻の昇順に並べる", () => {
    const routines = [
      routine({ id: 1, scheduledStartTime: "12:00" }),
      routine({ id: 2, scheduledStartTime: "06:30" }),
      routine({ id: 3, scheduledStartTime: "09:00" }),
    ];
    expect(routinesToExpand(routines, SUNDAY, SUNDAY).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("同時刻は名前の自然順に並べる", () => {
    const routines = [
      routine({ id: 1, name: "10.掃除", scheduledStartTime: "06:30" }),
      routine({ id: 2, name: "02.朝食", scheduledStartTime: "06:30" }),
    ];
    expect(routinesToExpand(routines, SUNDAY, SUNDAY).map((r) => r.id)).toEqual([2, 1]);
  });

  it("該当しないルーチンは除外する", () => {
    const routines = [
      routine({ id: 1 }),
      routine({ id: 2, isActive: false }),
      routine({ id: 3, recurrenceType: "weekly", weekdays: 0b0000001 }), // 月曜のみ
    ];
    expect(routinesToExpand(routines, SUNDAY, SUNDAY).map((r) => r.id)).toEqual([1]);
  });
});

describe("routinesToExpand — スキップの除外（F-304 / §3.6）", () => {
  it("その日にスキップされたルーチンは展開対象から除外する", () => {
    const routines = [routine({ id: 1 }), routine({ id: 2 })];
    expect(routinesToExpand(routines, SUNDAY, SUNDAY, [1]).map((r) => r.id)).toEqual([2]);
  });

  it("該当日でも全ルーチンをスキップ指定すれば0件になる", () => {
    const routines = [routine({ id: 1 }), routine({ id: 2 })];
    expect(routinesToExpand(routines, SUNDAY, SUNDAY, [1, 2])).toEqual([]);
  });

  it("非該当のIDを渡しても展開結果は変わらない", () => {
    const routines = [routine({ id: 1 }), routine({ id: 2 })];
    expect(routinesToExpand(routines, SUNDAY, SUNDAY, [999]).map((r) => r.id)).toEqual([1, 2]);
  });

  it("スキップ指定を省略すると全該当ルーチンを展開する（既定の後方互換）", () => {
    const routines = [routine({ id: 1 }), routine({ id: 2 })];
    expect(routinesToExpand(routines, SUNDAY, SUNDAY).map((r) => r.id)).toEqual([1, 2]);
  });
});
