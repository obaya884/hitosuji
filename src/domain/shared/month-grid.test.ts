import { describe, expect, it } from "vitest";
import { addDays } from "./logical-date";
import { addMonths, dayOf, monthGrid, monthOf, shiftMonthKeepingDay } from "./month-grid";

describe("monthOf（F-117 / 画面定義書01 §3.1: 論理日付の属する年月）", () => {
  it("YYYY-MM-DD から年月を取り出す", () => {
    expect(monthOf("2026-07-25")).toEqual({ year: 2026, month: 7 });
  });
});

describe("dayOf（F-117: 論理日付の日）", () => {
  it("YYYY-MM-DD から日を取り出す", () => {
    expect(dayOf("2026-07-05")).toBe(5);
  });
});

describe("addMonths（F-117: 前月/翌月への移動）", () => {
  it("翌月へ進める", () => {
    expect(addMonths({ year: 2026, month: 7 }, 1)).toEqual({ year: 2026, month: 8 });
  });

  it("12月から翌月で年をまたぐ", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("1月から前月で年をまたいで戻る", () => {
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("shiftMonthKeepingDay（F-117 / 画面定義書01 §3.1: ◀/▶ は同じ日を保ち月末は丸める）", () => {
  it("同じ日を保って翌月へ", () => {
    expect(shiftMonthKeepingDay("2026-07-15", 1)).toBe("2026-08-15");
  });

  it("同じ日を保って前月へ", () => {
    expect(shiftMonthKeepingDay("2026-07-15", -1)).toBe("2026-06-15");
  });

  it("移動先にその日がなければ月末へ丸める（1/31 の翌月 → 2月末）", () => {
    expect(shiftMonthKeepingDay("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("うるう年なら 1/31 の翌月は 2/29 まで", () => {
    expect(shiftMonthKeepingDay("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("年をまたいで移動する（1月の前月 → 前年12月）", () => {
    expect(shiftMonthKeepingDay("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("monthGrid（F-117 / 画面定義書01 §3.1: 月グリッド・週の起点は月曜）", () => {
  // 2026-07-01 は水曜日。月曜始まりなら先頭週は 6/29(月) から始まる
  it("月曜始まりで前月末を先頭に補う", () => {
    const grid = monthGrid({ year: 2026, month: 7 }, 1);
    expect(grid[0][0]).toBe("2026-06-29"); // 月曜
    expect(grid[0][6]).toBe("2026-07-05"); // 日曜
  });

  it("各週がちょうど7日で、月内の全日が連続して並ぶ", () => {
    const grid = monthGrid({ year: 2026, month: 7 }, 1);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    const flat = grid.flat();
    // 端点だけでなく、起点から1日ずつ連続していることを確認する
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i]).toBe(addDays(flat[i - 1], 1));
    }
    // 月内の全日（1〜31）が present
    for (let d = 1; d <= 31; d++) {
      expect(flat).toContain(`2026-07-${String(d).padStart(2, "0")}`);
    }
  });

  it("うるう年2月は 2/29 を含む", () => {
    const flat = monthGrid({ year: 2024, month: 2 }, 1).flat();
    expect(flat).toContain("2024-02-29");
  });

  it("非うるう年2月は 2/29 を含まず 2/28 で切れる", () => {
    const flat = monthGrid({ year: 2025, month: 2 }, 1).flat();
    expect(flat).toContain("2025-02-28");
    expect(flat).not.toContain("2025-02-29");
  });

  it("週起点と1日が一致し28日の月はちょうど4週（2021-02 は月曜始まり）", () => {
    const grid = monthGrid({ year: 2021, month: 2 }, 1);
    expect(grid).toHaveLength(4);
    expect(grid[0][0]).toBe("2021-02-01");
    expect(grid[3][6]).toBe("2021-02-28");
  });

  it("リードが大きい31日の月は6週になる（2025-03 は土曜始まり）", () => {
    const grid = monthGrid({ year: 2025, month: 3 }, 1);
    expect(grid).toHaveLength(6);
    const flat = grid.flat();
    expect(flat).toContain("2025-03-31");
  });

  it("グリッドのセルが年をまたぐ（12月末→翌年1月）", () => {
    const last = monthGrid({ year: 2026, month: 12 }, 1).at(-1)!;
    expect(last.some((cell) => cell.startsWith("2027-01"))).toBe(true);
  });

  it("グリッドのセルが年をまたぐ（1月頭→前年12月）", () => {
    const first = monthGrid({ year: 2026, month: 1 }, 1)[0];
    expect(first.some((cell) => cell.startsWith("2025-12"))).toBe(true);
  });

  it("末尾週は翌月頭で埋める", () => {
    // 2026-07-31 は金曜。月曜始まりの最終週は 7/27(月)〜8/2(日)
    const grid = monthGrid({ year: 2026, month: 7 }, 1);
    const last = grid[grid.length - 1];
    expect(last[0]).toBe("2026-07-27");
    expect(last[6]).toBe("2026-08-02");
  });

  it("日曜始まりでは先頭が日曜になる", () => {
    // 2026-07-01(水) の週の日曜は 6/28
    const grid = monthGrid({ year: 2026, month: 7 }, 0);
    expect(grid[0][0]).toBe("2026-06-28");
  });

  it("1日が週の起点と一致する月はリード日を挟まない（2026-06 は月曜始まり）", () => {
    // 2026-06-01 は月曜
    const grid = monthGrid({ year: 2026, month: 6 }, 1);
    expect(grid[0][0]).toBe("2026-06-01");
  });
});
