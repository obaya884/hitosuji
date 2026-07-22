import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  hasWeekday,
  toggleWeekday,
  weekdayBitOf,
  type Routine,
} from "./routine";

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

describe("describeRecurrence（画面定義書02 §3: 繰り返しルールの要約表示）", () => {
  it("毎日は「毎日」", () => {
    expect(describeRecurrence(routine({ id: 1, recurrenceType: "daily" }))).toBe("毎日");
  });

  it("週次は曜日ラベルを中黒で連結する（bit0=月 … bit6=日）", () => {
    const mwf = routine({ id: 1, recurrenceType: "weekly", weekdays: 0b0010101 });
    expect(describeRecurrence(mwf)).toBe("週次(月・水・金)");
  });

  it("週次で単一曜日なら1つだけ表示する", () => {
    const sunday = routine({ id: 1, recurrenceType: "weekly", weekdays: 0b1000000 });
    expect(describeRecurrence(sunday)).toBe("週次(日)");
  });

  it("週次で曜日未設定（null・0）なら「週次」だけ", () => {
    expect(describeRecurrence(routine({ id: 1, recurrenceType: "weekly", weekdays: null }))).toBe(
      "週次"
    );
    expect(describeRecurrence(routine({ id: 1, recurrenceType: "weekly", weekdays: 0 }))).toBe(
      "週次"
    );
  });

  it("月次は「月次(N日)」", () => {
    expect(describeRecurrence(routine({ id: 1, recurrenceType: "monthly", monthDay: 25 }))).toBe(
      "月次(25日)"
    );
  });

  it("間隔は「N日ごと」", () => {
    expect(describeRecurrence(routine({ id: 1, recurrenceType: "interval", intervalDays: 3 }))).toBe(
      "3日ごと"
    );
  });

  it("終了日があると要約の末尾に「〜終了日」を付ける", () => {
    const r = routine({ id: 1, recurrenceType: "daily", endDate: "2026-12-31" });
    expect(describeRecurrence(r)).toBe("毎日 〜2026-12-31");
  });
});

describe("weekdayBitOf（データモデル定義書 §3.4: 曜日ビットマスク bit0=月 … bit6=日。日曜=0 の index をビット位置へ）", () => {
  it("月曜(1)は bit0、日曜(0)は bit6 に対応する", () => {
    expect(weekdayBitOf(1)).toBe(0); // 月
    expect(weekdayBitOf(0)).toBe(6); // 日
  });

  it("火〜土(2〜6)は bit1〜bit5 に順に対応する", () => {
    expect([2, 3, 4, 5, 6].map(weekdayBitOf)).toEqual([1, 2, 3, 4, 5]); // 火・水・木・金・土
  });
});

describe("hasWeekday（データモデル定義書 §4.1: weekly 展開の曜日該当判定。index は日曜=0 の並び）", () => {
  it("該当曜日のビットが立っていれば true、非該当は false", () => {
    const monday = 0b0000001; // 月(bit0)
    expect(hasWeekday(monday, 1)).toBe(true); // 月曜(index1)
    expect(hasWeekday(monday, 0)).toBe(false); // 日曜(index0)は非該当
  });

  it("日曜(bit6)も正しく判定する（off-by-one しない）", () => {
    const sunday = 0b1000000; // 日(bit6)
    expect(hasWeekday(sunday, 0)).toBe(true); // 日曜(index0)
    expect(hasWeekday(sunday, 6)).toBe(false); // 土曜(index6)は非該当
  });

  it("全曜日マスクは index 0〜6 すべてで true（全曜日の該当を担保）", () => {
    const all = 0b1111111;
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => hasWeekday(all, i))).toEqual([
      true, // 日
      true, // 月
      true, // 火
      true, // 水
      true, // 木
      true, // 金
      true, // 土
    ]);
  });

  it("複数曜日のマスクは該当する全曜日で true", () => {
    const mwf = 0b0010101; // 月・水・金
    expect(hasWeekday(mwf, 1)).toBe(true); // 月
    expect(hasWeekday(mwf, 3)).toBe(true); // 水
    expect(hasWeekday(mwf, 5)).toBe(true); // 金
    expect(hasWeekday(mwf, 2)).toBe(false); // 火は非該当
  });
});

describe("toggleWeekday（画面定義書02 §4: 曜日ビットの切り替え。bit0=月 … bit6=日）", () => {
  it("立っていないビットを立てる", () => {
    expect(toggleWeekday(0b0000000, 0)).toBe(0b0000001); // 月を追加
    expect(toggleWeekday(0b0000001, 6)).toBe(0b1000001); // 月に日を追加
  });

  it("立っているビットを落とす", () => {
    expect(toggleWeekday(0b0000001, 0)).toBe(0b0000000); // 月を外す
    expect(toggleWeekday(0b1000001, 6)).toBe(0b0000001); // 日を外す（月は残る）
  });

  it("同じビットを2回切り替えると元に戻る（対称）", () => {
    expect(toggleWeekday(toggleWeekday(0b0010101, 3), 3)).toBe(0b0010101);
  });
});
