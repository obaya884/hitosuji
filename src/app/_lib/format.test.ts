import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDuration,
  formatEstimate,
  formatLogicalDate,
  todayLogicalDate,
} from "./format";

describe("formatEstimate（画面定義書01 §3.3: 見積もり未設定は --:--）", () => {
  it("未設定（0分）は --:-- で表す", () => {
    expect(formatEstimate(0)).toBe("--:--");
  });

  it("分を H:MM へ整形する", () => {
    expect(formatEstimate(30)).toBe("0:30");
    expect(formatEstimate(90)).toBe("1:30");
    expect(formatEstimate(600)).toBe("10:00");
  });
});

describe("formatDuration（画面定義書01 §3.3: 1分未満の実績は 0:00）", () => {
  it("0分の実績は --:-- ではなく 0:00 と表示する", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("分を H:MM へ整形する", () => {
    expect(formatDuration(18)).toBe("0:18");
    expect(formatDuration(125)).toBe("2:05");
  });
});

describe("formatLogicalDate（画面定義書01 §3.1）", () => {
  it("YYYY-MM-DD(曜) 形式にする", () => {
    expect(formatLogicalDate("2026-07-19", 0)).toBe("2026-07-19(日)");
  });

  it("曜日インデックスの上端（6=土）も正しく引く", () => {
    expect(formatLogicalDate("2026-07-25", 6)).toBe("2026-07-25(土)");
  });
});

describe("formatClock（画面定義書01 §3.3: 打刻時刻は日本時間 HH:MM）", () => {
  it("UTC を日本時間（+9h）へ変換してゼロ埋めする", () => {
    // 2026-07-20T00:05:00Z → JST 09:05
    expect(formatClock(new Date("2026-07-20T00:05:00Z"))).toBe("09:05");
  });

  it("JST 深夜0時は 00:00（24:00 ではない）", () => {
    // 2026-07-20T15:00:00Z → JST 翌 00:00
    expect(formatClock(new Date("2026-07-20T15:00:00Z"))).toBe("00:00");
  });
});

describe("todayLogicalDate（既定 = 日界 00:00・日本時間の暦日）", () => {
  it("JST 23:59:59 はその日のまま", () => {
    // 2026-07-20T14:59:59Z → JST 2026-07-20 23:59:59
    expect(todayLogicalDate(new Date("2026-07-20T14:59:59Z"))).toBe("2026-07-20");
  });

  it("JST 0:00 を跨ぐと翌日の暦日になる（UTC 深夜帯で日付がずれる境界）", () => {
    // 2026-07-20T15:00:00Z → JST 2026-07-21 00:00:00
    expect(todayLogicalDate(new Date("2026-07-20T15:00:00Z"))).toBe("2026-07-21");
  });
});

describe("todayLogicalDate（F-116: 日界を指定すると解決がずれる）", () => {
  it("日界 06:00 で JST 05:59 はまだ前の暦日", () => {
    // 2026-07-20T20:59:00Z → JST 2026-07-21 05:59 → 日界06:00前なので 07-20
    expect(todayLogicalDate(new Date("2026-07-20T20:59:00Z"), "06:00")).toBe("2026-07-20");
  });

  it("日界 06:00 ちょうどはその暦日の今日", () => {
    // 2026-07-20T21:00:00Z → JST 2026-07-21 06:00 → 07-21
    expect(todayLogicalDate(new Date("2026-07-20T21:00:00Z"), "06:00")).toBe("2026-07-21");
  });

  it("日界 00:00 を明示しても既定（暦日）と一致する", () => {
    expect(todayLogicalDate(new Date("2026-07-20T20:59:00Z"), "00:00")).toBe("2026-07-21");
  });
});
