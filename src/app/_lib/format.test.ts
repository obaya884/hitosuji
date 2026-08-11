import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDuration,
  formatLogicalDate,
  formatSignedDuration,
  normalizeClockInput,
} from "./format";

describe("formatDuration（画面定義書01 §3.3: 1分未満の実績は 0:00）", () => {
  it("0分の実績は --:-- ではなく 0:00 と表示する", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("分を H:MM へ整形する", () => {
    expect(formatDuration(18)).toBe("0:18");
    expect(formatDuration(125)).toBe("2:05");
    // 時は2桁でもゼロ埋めしない（分だけ padStart する）
    expect(formatDuration(600)).toBe("10:00");
  });
});

describe("formatSignedDuration（画面定義書04 §3.3 / 01 §3.2: 差の向きを符号で示す。0 は符号なし）", () => {
  it("正は `+`・負は `-` を付ける", () => {
    expect(formatSignedDuration(10)).toBe("+0:10");
    expect(formatSignedDuration(-90)).toBe("-1:30");
  });

  it("差が無い（0）ときは符号を付けない", () => {
    expect(formatSignedDuration(0)).toBe("0:00");
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

describe("normalizeClockInput（画面定義書01 §3.3: 区切りなし入力の正規化）", () => {
  it("区切りなし入力（4桁・3桁）を HH:MM へ整形する", () => {
    expect(normalizeClockInput("0805")).toBe("08:05");
    expect(normalizeClockInput("805")).toBe("08:05");
  });

  it("区切りあり入力（1桁時）も HH:MM へ整形する", () => {
    expect(normalizeClockInput("8:05")).toBe("08:05");
  });

  it("すでに HH:MM の入力はそのまま通す", () => {
    expect(normalizeClockInput("23:59")).toBe("23:59");
  });

  it("範囲外（24時台・60分台）は null", () => {
    expect(normalizeClockInput("24:00")).toBeNull();
    expect(normalizeClockInput("12:60")).toBeNull();
  });

  it("余剰つきの入力（末尾に文字・秒付き）は null", () => {
    expect(normalizeClockInput("09:05x")).toBeNull();
    expect(normalizeClockInput("12:34:56")).toBeNull();
  });

  it("空文字・空白のみは null", () => {
    expect(normalizeClockInput("")).toBeNull();
    expect(normalizeClockInput("   ")).toBeNull();
  });

  it("前後の空白はトリムしてから解釈する", () => {
    expect(normalizeClockInput("  0805  ")).toBe("08:05");
  });
});
