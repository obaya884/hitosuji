import { describe, expect, it } from "vitest";
import {
  addDays,
  atLogicalDayClock,
  isValidLogicalDate,
  todayLogicalDate,
  weekdayIndex,
} from "./logical-date";
import { APP_TIME_ZONE } from "./time-zone";

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

describe("addDays（F-106: 前日・翌日への移動）", () => {
  it("月末・年末をまたいで加減算できる", () => {
    expect(addDays("2026-07-19", 1)).toBe("2026-07-20");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("atLogicalDayClock（F-116 / 画面定義書01 §3.3: 論理日の中の壁時計を絶対時刻にする）", () => {
  const DAY_START_0600 = 6 * 60;

  it("日界以降の時刻は論理日の暦日に落ちる", () => {
    // JST 2026-07-21 23:40 = 07-21T14:40Z
    expect(
      atLogicalDayClock("2026-07-21", 23 * 60 + 40, APP_TIME_ZONE, DAY_START_0600).toISOString()
    ).toBe("2026-07-21T14:40:00.000Z");
  });

  it("日界より前の時刻は論理日の翌暦日に落ちる（todayLogicalDate の逆向き）", () => {
    // JST 2026-07-22 01:00 = 07-21T16:00Z
    expect(atLogicalDayClock("2026-07-21", 60, APP_TIME_ZONE, DAY_START_0600).toISOString()).toBe(
      "2026-07-21T16:00:00.000Z"
    );
  });

  it("日界ちょうどはその暦日のまま", () => {
    expect(
      atLogicalDayClock("2026-07-21", DAY_START_0600, APP_TIME_ZONE, DAY_START_0600).toISOString()
    ).toBe("2026-07-20T21:00:00.000Z"); // JST 07-21 06:00
  });

  it("日界 0 なら常に論理日の暦日そのもの", () => {
    expect(atLogicalDayClock("2026-07-21", 0, APP_TIME_ZONE, 0).toISOString()).toBe(
      "2026-07-20T15:00:00.000Z" // JST 07-21 00:00
    );
  });

  it("月末をまたぐ論理日でも翌暦日を正しく取る", () => {
    expect(atLogicalDayClock("2026-07-31", 60, APP_TIME_ZONE, DAY_START_0600).toISOString()).toBe(
      "2026-07-31T16:00:00.000Z" // JST 08-01 01:00
    );
  });

  it("壁時計はタイムゾーン引数で解釈する（定数を直接見ていない）", () => {
    expect(atLogicalDayClock("2026-07-21", 60, "UTC", DAY_START_0600).toISOString()).toBe(
      "2026-07-22T01:00:00.000Z"
    );
  });

  // 日界より前の壁時計は翌暦日へ送られる（上のケース）ので、同じ日界で読み戻して初めて
  // 元の論理日に戻る。`todayLogicalDate` が逆向きの唯一の入口
  it("同じ日界で読み戻すと元の論理日に一致する（todayLogicalDate との往復）", () => {
    const at = atLogicalDayClock("2026-07-21", 60, APP_TIME_ZONE, DAY_START_0600);
    expect(todayLogicalDate(at, APP_TIME_ZONE, DAY_START_0600)).toBe("2026-07-21");
  });
});

describe("todayLogicalDate（F-116: 現在時刻から今日を決める。日界 0 なら運用タイムゾーンの暦日）", () => {
  it("JST 23:59:59 はその日のまま", () => {
    // 2026-07-20T14:59:59Z → JST 2026-07-20 23:59:59
    expect(todayLogicalDate(new Date("2026-07-20T14:59:59Z"), APP_TIME_ZONE, 0)).toBe("2026-07-20");
  });

  it("JST 0:00 を跨ぐと翌日の暦日になる（UTC 深夜帯で日付がずれる境界）", () => {
    // 2026-07-20T15:00:00Z → JST 2026-07-21 00:00:00
    expect(todayLogicalDate(new Date("2026-07-20T15:00:00Z"), APP_TIME_ZONE, 0)).toBe("2026-07-21");
  });

  it("暦日はタイムゾーン引数で読む（実行環境のローカル時刻に依らない）", () => {
    // 同じ瞬間が JST では 07-21、UTC では 07-20
    expect(todayLogicalDate(new Date("2026-07-20T15:00:00Z"), "UTC", 0)).toBe("2026-07-20");
  });
});

describe("todayLogicalDate（F-116: 日界を指定すると解決がずれる）", () => {
  const DAY_START = 6 * 60; // 日界 06:00

  it("日界 06:00 で JST 05:59 はまだ前の暦日", () => {
    // 2026-07-20T20:59:00Z → JST 2026-07-21 05:59 → 日界06:00前なので 07-20
    expect(todayLogicalDate(new Date("2026-07-20T20:59:00Z"), APP_TIME_ZONE, DAY_START)).toBe(
      "2026-07-20"
    );
  });

  it("深夜0時ちょうど（JST 00:00）も日界前なら前の暦日", () => {
    // 2026-07-20T15:00:00Z → JST 2026-07-21 00:00 → 日界06:00前なので 07-20
    expect(todayLogicalDate(new Date("2026-07-20T15:00:00Z"), APP_TIME_ZONE, DAY_START)).toBe(
      "2026-07-20"
    );
  });

  it("日界 06:00 ちょうどはその暦日の今日", () => {
    // 2026-07-20T21:00:00Z → JST 2026-07-21 06:00 → 07-21
    expect(todayLogicalDate(new Date("2026-07-20T21:00:00Z"), APP_TIME_ZONE, DAY_START)).toBe(
      "2026-07-21"
    );
  });

  it("日界より後の時間帯はその暦日のまま", () => {
    // 2026-07-21T07:40:00Z → JST 2026-07-21 16:40 → 07-21
    expect(todayLogicalDate(new Date("2026-07-21T07:40:00Z"), APP_TIME_ZONE, DAY_START)).toBe(
      "2026-07-21"
    );
  });

  it("日界 0 なら暦日と一致する", () => {
    expect(todayLogicalDate(new Date("2026-07-20T20:59:00Z"), APP_TIME_ZONE, 0)).toBe("2026-07-21");
  });
});

describe("weekdayIndex", () => {
  it("0=日曜として曜日を返す", () => {
    expect(weekdayIndex("2026-07-19")).toBe(0); // 日曜
    expect(weekdayIndex("2026-07-20")).toBe(1); // 月曜
  });
});
