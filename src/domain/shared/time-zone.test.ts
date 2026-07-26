import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, fromZonedClock, withZonedClockTime, zonedParts } from "./time-zone";

// 夏時間を持つゾーン。運用タイムゾーン（Asia/Tokyo）には無いが、ずれを瞬間ごとに引く実装を固定する
const NEW_YORK = "America/New_York";

describe("APP_TIME_ZONE（F-116 / データモデル定義書 §1: 運用タイムゾーンは日本時間）", () => {
  it("Asia/Tokyo を指す", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Tokyo");
  });
});

describe("zonedParts（絶対時刻を指定タイムゾーンの壁時計として読む）", () => {
  it("UTC の日付をまたぐ瞬間も JST の壁時計で読む", () => {
    expect(zonedParts(new Date("2026-07-20T15:00:00Z"), APP_TIME_ZONE)).toEqual({
      year: 2026,
      month: 7,
      day: 21,
      hours: 0,
      minutes: 0,
    });
  });

  it("秒は切り捨てる（JST 23:59:59 → 23:59）", () => {
    expect(zonedParts(new Date("2026-07-20T14:59:59Z"), APP_TIME_ZONE)).toEqual({
      year: 2026,
      month: 7,
      day: 20,
      hours: 23,
      minutes: 59,
    });
  });

  it("夏時間のゾーンでは同じ絶対時刻が時期によって別の壁時計になる", () => {
    // EST（-5h）と EDT（-4h）
    expect(zonedParts(new Date("2026-01-15T12:00:00Z"), NEW_YORK).hours).toBe(7);
    expect(zonedParts(new Date("2026-07-15T12:00:00Z"), NEW_YORK).hours).toBe(8);
  });
});

describe("fromZonedClock（壁時計から絶対時刻を作る）", () => {
  it("JST の壁時計を絶対時刻へ戻す（zonedParts の逆）", () => {
    const at = fromZonedClock(
      { year: 2026, month: 7, day: 21, hours: 0, minutes: 0 },
      APP_TIME_ZONE
    );
    expect(at.toISOString()).toBe("2026-07-20T15:00:00.000Z");
  });

  it("秒・ミリ秒は落とす", () => {
    const at = fromZonedClock(
      { year: 2026, month: 7, day: 26, hours: 9, minutes: 5 },
      APP_TIME_ZONE
    );
    expect(at.toISOString()).toBe("2026-07-26T00:05:00.000Z");
  });

  it("day の繰り下がりを許す（day: 0 は前月末日。日界が前の暦日を指すときに使う）", () => {
    const at = fromZonedClock({ year: 2026, month: 8, day: 0, hours: 0, minutes: 0 }, APP_TIME_ZONE);
    expect(zonedParts(at, APP_TIME_ZONE)).toMatchObject({ year: 2026, month: 7, day: 31 });
  });

  it("month・hours の繰り上がりも許す（`Date.UTC` と同じ扱い）", () => {
    const nextYear = fromZonedClock(
      { year: 2026, month: 13, day: 1, hours: 0, minutes: 0 },
      APP_TIME_ZONE
    );
    expect(zonedParts(nextYear, APP_TIME_ZONE)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
      hours: 0,
      minutes: 0,
    });

    const nextDay = fromZonedClock(
      { year: 2026, month: 7, day: 26, hours: 24, minutes: 0 },
      APP_TIME_ZONE
    );
    expect(zonedParts(nextDay, APP_TIME_ZONE)).toMatchObject({ month: 7, day: 27, hours: 0 });
  });

  it("夏時間の切り替え日でも壁時計どおりの瞬間を返す（ずれを求め直す）", () => {
    // 2026-03-08 の NY は 02:00 EST → 03:00 EDT。03:00 EDT = 07:00Z
    // （仮の瞬間のずれ EST を1度しか使わないと 08:00Z になる）
    const at = fromZonedClock({ year: 2026, month: 3, day: 8, hours: 3, minutes: 0 }, NEW_YORK);
    expect(at.toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });

  it("夏時間の切り替えで存在しない壁時計は、切り替え前のずれで解いた瞬間になる（往復しない）", () => {
    // 2026-03-08 の NY に 02:30 は存在しない（01:59:59 EST の次が 03:00:00 EDT）
    const at = fromZonedClock({ year: 2026, month: 3, day: 8, hours: 2, minutes: 30 }, NEW_YORK);
    expect(at.toISOString()).toBe("2026-03-08T06:30:00.000Z");
    expect(zonedParts(at, NEW_YORK)).toMatchObject({ hours: 1, minutes: 30 }); // 読み戻すと 01:30 EST
  });

  it("夏時間の切り替えで2度ある壁時計は夏時間（EDT）側を採る", () => {
    // 2026-11-01 の NY は 01:59:59 EDT のあと 01:00:00 EST に戻るので 01:30 が2度ある
    const at = fromZonedClock({ year: 2026, month: 11, day: 1, hours: 1, minutes: 30 }, NEW_YORK);
    expect(at.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("夏時間でないゾーンの壁時計は往復しても変わらない", () => {
    const clock = { year: 2026, month: 12, day: 31, hours: 23, minutes: 59 };
    expect(zonedParts(fromZonedClock(clock, APP_TIME_ZONE), APP_TIME_ZONE)).toEqual(clock);
  });
});

describe("withZonedClockTime（F-203: 時刻だけを当てはめ暦日は動かさない）", () => {
  it("基準時刻の JST 暦日に時分を当てはめる", () => {
    // 2026-07-20T15:30:00Z = JST 07-21 00:30 → 同じ JST 暦日の 09:05 = 07-21T00:05Z
    const applied = withZonedClockTime(new Date("2026-07-20T15:30:00Z"), 9, 5, APP_TIME_ZONE);
    expect(applied.toISOString()).toBe("2026-07-21T00:05:00.000Z");
  });

  it("同じ絶対時刻でもタイムゾーンが違えば当てはめる暦日が変わる", () => {
    // 2026-07-20T15:30:00Z は NY では 07-20 11:30 → 09:05 EDT = 07-20T13:05Z
    const applied = withZonedClockTime(new Date("2026-07-20T15:30:00Z"), 9, 5, NEW_YORK);
    expect(applied.toISOString()).toBe("2026-07-20T13:05:00.000Z");
  });
});
