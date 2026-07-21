import { describe, expect, it } from "vitest";
import { describeRecurrence, toggleWeekday, type Routine } from "./routine";

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
