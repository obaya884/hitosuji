import { describe, expect, it } from "vitest";
import { formatDuration, formatEstimate, formatLogicalDate } from "./format";

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
});
