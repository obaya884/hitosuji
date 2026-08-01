import { describe, expect, it } from "vitest";
import {
  ALL_WEEKDAYS,
  describeRecurrence,
  hasWeekday,
  toggleWeekday,
  weekdayBitOf,
  weekdayPresetLabel,
  WEEKDAY_BITS,
  WEEKDAY_PRESETS,
} from "./routine";
import { routine } from "./testing/routine";

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

  it("週間隔に応じて接頭を変える（1/NULL=週次・2=隔週・n=n週ごと）（FB-44）", () => {
    const weekly = (weekInterval: number | null) =>
      routine({ id: 1, recurrenceType: "weekly", weekdays: 0b0000010, weekInterval }); // 火
    expect(describeRecurrence(weekly(1))).toBe("週次(火)");
    expect(describeRecurrence(weekly(null))).toBe("週次(火)");
    expect(describeRecurrence(weekly(2))).toBe("隔週(火)");
    expect(describeRecurrence(weekly(3))).toBe("3週ごと(火)");
  });

  it("曜日がプリセットとちょうど一致するときは列挙をプリセット名に置き換える（FB-53）", () => {
    const weekday = routine({ id: 1, recurrenceType: "weekly", weekdays: 0b0011111 }); // 月〜金
    expect(describeRecurrence(weekday)).toBe("週次(平日)");
    const weekend = routine({ id: 2, recurrenceType: "weekly", weekdays: 0b1100000 }); // 土・日
    expect(describeRecurrence(weekend)).toBe("週次(土日)");
  });

  it("プリセット名は週間隔の接頭・終了日と独立に効く（FB-53）", () => {
    const weekly = (weekdays: number, weekInterval: number | null) =>
      routine({ id: 1, recurrenceType: "weekly", weekdays, weekInterval });
    expect(describeRecurrence(weekly(0b0011111, null))).toBe("週次(平日)");
    expect(describeRecurrence(weekly(0b0011111, 2))).toBe("隔週(平日)");
    expect(describeRecurrence(weekly(0b0011111, 3))).toBe("3週ごと(平日)");
    expect(describeRecurrence(weekly(0b1100000, 2))).toBe("隔週(土日)");
    expect(
      describeRecurrence(
        routine({ id: 1, recurrenceType: "weekly", weekdays: 0b0011111, endDate: "2026-12-31" })
      )
    ).toBe("週次(平日) 〜2026-12-31");
  });

  it("プリセットとちょうど一致しない曜日は列挙にフォールバックする（境界の網羅は weekdayPresetLabel 側）（FB-53）", () => {
    const withSaturday = routine({ id: 1, recurrenceType: "weekly", weekdays: 0b0111111 }); // 月〜土
    expect(describeRecurrence(withSaturday)).toBe("週次(月・火・水・木・金・土)");
  });

  it("週間隔2以上の全曜日は列挙する（正規化の対象外。画面定義書02 §3）", () => {
    const biweekly = routine({
      id: 1,
      recurrenceType: "weekly",
      weekdays: ALL_WEEKDAYS,
      weekInterval: 2,
    });
    expect(describeRecurrence(biweekly)).toBe("隔週(月・火・水・木・金・土・日)");
  });

  it("プリセット適用後に個別の曜日を足すと要約は列挙へ戻る（画面定義書02 §4: 押したあとの微調整）", () => {
    const adjusted = toggleWeekday(0b0011111, 5); // 平日に土を足す
    const r = routine({ id: 1, recurrenceType: "weekly", weekdays: adjusted });
    expect(describeRecurrence(r)).toBe("週次(月・火・水・木・金・土)");
  });

  it("曜日ビットの範囲外（bit7以上）しか立っていない場合は曜日を出さない", () => {
    expect(
      describeRecurrence(routine({ id: 1, recurrenceType: "weekly", weekdays: 1 << 7 }))
    ).toBe("週次");
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
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => hasWeekday(ALL_WEEKDAYS, i))).toEqual([
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

describe("WEEKDAY_PRESETS（画面定義書02 §4: 曜日プリセット。bit0=月 … bit6=日）", () => {
  function maskOf(label: string): number {
    const preset = WEEKDAY_PRESETS.find((p) => p.label === label);
    if (preset === undefined) throw new Error(`プリセット「${label}」がない`);
    return preset.mask;
  }

  /** マスクに立っている曜日のラベル（月→日の順） */
  function labelsOf(mask: number): readonly string[] {
    return WEEKDAY_BITS.filter((w) => (mask & (1 << w.bit)) !== 0).map((w) => w.label);
  }

  it("プリセットは「平日」「土日」の2つで、その順に並ぶ（UI のボタン表示順）", () => {
    expect(WEEKDAY_PRESETS.map((p) => p.label)).toEqual(["平日", "土日"]);
  });

  it("「平日」は月〜金、「土日」は土・日をちょうど含む", () => {
    expect(labelsOf(maskOf("平日"))).toEqual(["月", "火", "水", "木", "金"]);
    expect(labelsOf(maskOf("土日"))).toEqual(["土", "日"]);
  });

  it("展開判定（日曜=0 の index）でも同じ曜日に該当する＝ビットの並びを取り違えていない", () => {
    const weekday = maskOf("平日");
    expect(hasWeekday(weekday, 1)).toBe(true); // 月曜(index1)
    expect(hasWeekday(weekday, 0)).toBe(false); // 日曜(index0)
    expect(hasWeekday(weekday, 6)).toBe(false); // 土曜(index6)
    const weekend = maskOf("土日");
    expect(hasWeekday(weekend, 0)).toBe(true); // 日曜(index0)
    expect(hasWeekday(weekend, 6)).toBe(true); // 土曜(index6)
    expect(hasWeekday(weekend, 1)).toBe(false); // 月曜(index1)
  });
});

describe("weekdayPresetLabel（画面定義書02 §3: プリセットとちょうど一致するときだけ名前を返す）", () => {
  it("ちょうど一致すればプリセット名を返す", () => {
    expect(weekdayPresetLabel(0b0011111)).toBe("平日"); // 月〜金
    expect(weekdayPresetLabel(0b1100000)).toBe("土日"); // 土・日
  });

  it("余分な曜日を含む・一部しか立っていない場合は null", () => {
    expect(weekdayPresetLabel(0b0111111)).toBeNull(); // 月〜土（平日＋土）
    expect(weekdayPresetLabel(0b1100001)).toBeNull(); // 土日＋月
    expect(weekdayPresetLabel(0b0001111)).toBeNull(); // 月〜木（平日の一部）
    expect(weekdayPresetLabel(0b0100000)).toBeNull(); // 土のみ
    expect(weekdayPresetLabel(ALL_WEEKDAYS)).toBeNull(); // 全曜日
    expect(weekdayPresetLabel(0)).toBeNull(); // 未選択
  });
});
