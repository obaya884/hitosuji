import { describe, expect, it } from "vitest";
import {
  addDays,
  applyDayStart,
  isValidLogicalDate,
  parseLogicalDate,
  weekdayIndex,
} from "./logical-date";

describe("isValidLogicalDate（データモデル定義書 §1: task_date は YYYY-MM-DD の論理日付）", () => {
  it("形式と実在日を検証する", () => {
    expect(isValidLogicalDate("2026-07-19")).toBe(true);
    expect(isValidLogicalDate("2026-02-30")).toBe(false);
    expect(isValidLogicalDate("2026-7-19")).toBe(false);
    expect(isValidLogicalDate("today")).toBe(false);
  });

  it("うるう年の2月29日を実在日として扱う", () => {
    expect(isValidLogicalDate("2028-02-29")).toBe(true);
    expect(isValidLogicalDate("2027-02-29")).toBe(false);
  });
});

describe("parseLogicalDate", () => {
  it("不正な日付は Result のエラーで返す", () => {
    expect(parseLogicalDate("2026-13-01")).toEqual({ ok: false, error: "invalid_date" });
    expect(parseLogicalDate("2026-07-19")).toEqual({ ok: true, value: "2026-07-19" });
  });
});

describe("addDays（F-106: 前日・翌日への移動）", () => {
  it("月末・年末をまたいで加減算できる", () => {
    expect(addDays("2026-07-19", 1)).toBe("2026-07-20");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("applyDayStart（F-116: 日界を踏まえて論理日付を決める）", () => {
  it("壁時計分が日界より前なら前の暦日", () => {
    // 日界 06:00（=360分）で 05:59（=359分）は前日
    expect(applyDayStart("2026-07-21", 359, 360)).toBe("2026-07-20");
  });

  it("深夜0時ちょうど（壁時計 00:00）も日界前なら前の暦日", () => {
    expect(applyDayStart("2026-07-21", 0, 360)).toBe("2026-07-20");
  });

  it("壁時計分が日界以上ならその暦日のまま", () => {
    expect(applyDayStart("2026-07-21", 360, 360)).toBe("2026-07-21");
    expect(applyDayStart("2026-07-21", 1000, 360)).toBe("2026-07-21");
  });

  it("日界 0 なら常に暦日と一致する", () => {
    expect(applyDayStart("2026-07-21", 0, 0)).toBe("2026-07-21");
    expect(applyDayStart("2026-07-21", 5, 0)).toBe("2026-07-21");
  });
});

describe("weekdayIndex", () => {
  it("0=日曜として曜日を返す", () => {
    expect(weekdayIndex("2026-07-19")).toBe(0); // 日曜
    expect(weekdayIndex("2026-07-20")).toBe(1); // 月曜
  });
});
