import { describe, expect, it } from "vitest";
import { validateRoutineInput, type RoutineInput } from "./input";

function input(over: Partial<RoutineInput> = {}): RoutineInput {
  return {
    name: "朝食",
    estimateMinutes: 20,
    scheduledStartTime: "06:30",
    modeId: null,
    projectId: null,
    recurrenceType: "daily",
    weekdays: null,
    weekInterval: 1,
    monthDay: null,
    intervalDays: null,
    startDate: "2026-07-19",
    endDate: null,
    ...over,
  };
}

describe("validateRoutineInput（画面定義書02 §4: 必須項目）", () => {
  it("名前が空ならエラー", () => {
    expect(validateRoutineInput(input({ name: "  " }))).toEqual({
      ok: false,
      error: "name_required",
    });
  });

  it("見積もりは必須（0以下・非整数はエラー）", () => {
    expect(validateRoutineInput(input({ estimateMinutes: 0 }))).toEqual({
      ok: false,
      error: "invalid_estimate",
    });
    expect(validateRoutineInput(input({ estimateMinutes: -5 })).ok).toBe(false);
    expect(validateRoutineInput(input({ estimateMinutes: 1.5 })).ok).toBe(false);
  });

  it("開始想定時刻の形式を検証する（DB形式の HH:MM:SS も受け付ける）", () => {
    expect(validateRoutineInput(input({ scheduledStartTime: "25:00" }))).toEqual({
      ok: false,
      error: "invalid_start_time",
    });
    const r = validateRoutineInput(input({ scheduledStartTime: "06:30:00" }));
    expect(r.ok && r.value.scheduledStartTime).toBe("06:30");
  });

  it("開始日は実在日であること", () => {
    expect(validateRoutineInput(input({ startDate: "2026-02-30" }))).toEqual({
      ok: false,
      error: "invalid_start_date",
    });
  });

  it("終了日は開始日以降であること（省略可）", () => {
    expect(validateRoutineInput(input({ endDate: "2026-07-18" }))).toEqual({
      ok: false,
      error: "end_date_before_start_date",
    });
    expect(validateRoutineInput(input({ endDate: "2026-07-19" })).ok).toBe(true);

    const omitted = validateRoutineInput(input({ endDate: "" }));
    expect(omitted.ok && omitted.value.endDate).toBeNull();
  });

  it("終了日が非空だが実在日でなければエラー", () => {
    expect(validateRoutineInput(input({ endDate: "2026-13-40" }))).toEqual({
      ok: false,
      error: "invalid_end_date",
    });
  });
});

describe("validateRoutineInput — 繰り返し種別ごとの必須項目（§4）", () => {
  it("週次は曜日が1つ以上必要", () => {
    expect(validateRoutineInput(input({ recurrenceType: "weekly", weekdays: 0 }))).toEqual({
      ok: false,
      error: "weekdays_required",
    });
    expect(validateRoutineInput(input({ recurrenceType: "weekly", weekdays: null })).ok).toBe(
      false
    );
    expect(
      validateRoutineInput(input({ recurrenceType: "weekly", weekdays: 0b0000001 })).ok
    ).toBe(true);
  });

  it("週次は週間隔が 1〜53 の整数（1=毎週。上限53）（FB-44）", () => {
    const weekly = (weekInterval: number | null) =>
      validateRoutineInput(input({ recurrenceType: "weekly", weekdays: 0b0000001, weekInterval }));
    expect(weekly(0)).toEqual({ ok: false, error: "invalid_week_interval" });
    expect(weekly(null).ok).toBe(false);
    expect(weekly(1.5).ok).toBe(false);
    expect(weekly(54)).toEqual({ ok: false, error: "invalid_week_interval" }); // 上限超過
    const ok = weekly(2);
    expect(ok.ok && ok.value.weekInterval).toBe(2);
    expect(validateRoutineInput(input({ recurrenceType: "weekly", weekdays: 0b0000001, weekInterval: 53 })).ok).toBe(true); // 上限ちょうど
  });

  it("月次は1〜31の日が必要", () => {
    expect(validateRoutineInput(input({ recurrenceType: "monthly", monthDay: 0 }))).toEqual({
      ok: false,
      error: "invalid_month_day",
    });
    expect(validateRoutineInput(input({ recurrenceType: "monthly", monthDay: 32 })).ok).toBe(
      false
    );
    expect(validateRoutineInput(input({ recurrenceType: "monthly", monthDay: 31 })).ok).toBe(
      true
    );
  });

  it("n日ごとは正の整数が必要", () => {
    expect(validateRoutineInput(input({ recurrenceType: "interval", intervalDays: 0 }))).toEqual({
      ok: false,
      error: "invalid_interval_days",
    });
    expect(validateRoutineInput(input({ recurrenceType: "interval", intervalDays: 3 })).ok).toBe(
      true
    );
  });

  it("種別に関係しない項目は null に落とす（種別変更時の残骸を残さない）", () => {
    const r = validateRoutineInput(
      input({
        recurrenceType: "daily",
        weekdays: 0b0000001,
        weekInterval: 3,
        monthDay: 25,
        intervalDays: 3,
      })
    );
    expect(
      r.ok && [r.value.weekdays, r.value.weekInterval, r.value.monthDay, r.value.intervalDays]
    ).toEqual([null, null, null, null]);
  });

  it("週次へ変えたら月次・間隔の値は落ち、曜日・週間隔は残る", () => {
    const r = validateRoutineInput(
      input({
        recurrenceType: "weekly",
        weekdays: 0b0000001,
        weekInterval: 2,
        monthDay: 25,
        intervalDays: 3,
      })
    );
    expect(
      r.ok && [r.value.weekdays, r.value.weekInterval, r.value.monthDay, r.value.intervalDays]
    ).toEqual([0b0000001, 2, null, null]);
  });
});
