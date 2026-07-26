import { describe, expect, it } from "vitest";
import { atJst } from "../shared/testing/clock";
import { APP_TIME_ZONE } from "../shared/time-zone";
import { applyClockTime, editEndedAt, editStartedAt } from "./punch-edit";
import { task } from "./testing/task";

// 打刻の修正は入力の `HH:MM` を運用タイムゾーンの壁時計として解釈するので、期待値も
// 同じ壁時計で組む（`atJst`）。実行環境の TZ には依らない（T-47）

describe("applyClockTime（F-203: HH:MM を直接修正する）", () => {
  it("元の打刻と同じ日の指定時刻にする（秒・ミリ秒は落とす）", () => {
    // 秒・ミリ秒が落ちることを見るので、分までしか持てない `atJst` に端数を足して組む
    const base = new Date(atJst("08:30").getTime() + 45_123);
    const result = applyClockTime(base, "09:05", APP_TIME_ZONE);
    expect(result).toEqual({ ok: true, value: atJst("09:05") });
  });

  it("入力は運用タイムゾーンの壁時計として解釈する（実行環境のローカル時刻に依らない）", () => {
    // JST 09:00（= 00:00Z）の打刻を 09:05 へ直すと JST 09:05（= 00:05Z）になる
    expect(applyClockTime(new Date("2026-07-26T00:00:00Z"), "09:05", APP_TIME_ZONE)).toEqual({
      ok: true,
      value: new Date("2026-07-26T00:05:00Z"),
    });
  });

  it("区切り文字なしの入力も受け付ける（1935 → 19:35、935 → 9:35）", () => {
    const base = atJst("08:00");
    expect(applyClockTime(base, "1935", APP_TIME_ZONE)).toEqual({ ok: true, value: atJst("19:35") });
    expect(applyClockTime(base, "935", APP_TIME_ZONE)).toEqual({ ok: true, value: atJst("09:35") });
    expect(applyClockTime(base, "0005", APP_TIME_ZONE)).toEqual({ ok: true, value: atJst("00:05") });
  });

  it("1桁の時も受け付ける（9:05）", () => {
    expect(applyClockTime(atJst("08:00"), "9:05", APP_TIME_ZONE)).toEqual({
      ok: true,
      value: atJst("09:05"),
    });
  });

  it("前後の空白は無視する", () => {
    expect(applyClockTime(atJst("08:00"), " 19:35 ", APP_TIME_ZONE)).toEqual({
      ok: true,
      value: atJst("19:35"),
    });
  });

  it("時刻として成立しない入力は確定不可（§8）", () => {
    const base = atJst("08:00");
    expect(applyClockTime(base, "24:00", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "invalid_time",
    });
    expect(applyClockTime(base, "1961", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "invalid_time",
    });
    expect(applyClockTime(base, "12345", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "invalid_time",
    });
    expect(applyClockTime(base, "19", APP_TIME_ZONE)).toEqual({ ok: false, error: "invalid_time" });
    expect(applyClockTime(base, "abc", APP_TIME_ZONE)).toEqual({ ok: false, error: "invalid_time" });
    expect(applyClockTime(base, "", APP_TIME_ZONE)).toEqual({ ok: false, error: "invalid_time" });
  });
});

describe("editStartedAt（F-203: 開始 ≦ 終了 の整合性チェック）", () => {
  it("実行中タスクの開始時刻を修正できる", () => {
    const t = task({ id: 1, startedAt: atJst("08:00") });
    expect(editStartedAt(t, "07:30", APP_TIME_ZONE)).toEqual({ ok: true, value: atJst("07:30") });
  });

  it("完了タスクでも終了時刻を超えなければ修正できる", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editStartedAt(t, "08:15", APP_TIME_ZONE)).toEqual({ ok: true, value: atJst("08:15") });
  });

  it("終了時刻より後の開始時刻は確定不可", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editStartedAt(t, "08:45", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "ended_before_started",
    });
  });

  it("未実行タスクには開始時刻がない", () => {
    expect(editStartedAt(task({ id: 1 }), "08:00", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "not_punched",
    });
  });

  it("時刻として成立しない入力は invalid_time を伝播する", () => {
    const t = task({ id: 1, startedAt: atJst("08:00") });
    expect(editStartedAt(t, "99:99", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "invalid_time",
    });
  });
});

describe("editEndedAt（F-203: 開始 ≦ 終了 の整合性チェック）", () => {
  it("完了タスクの終了時刻を修正できる", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editEndedAt(t, "08:45", APP_TIME_ZONE)).toEqual({ ok: true, value: atJst("08:45") });
  });

  it("開始時刻より前の終了時刻は確定不可", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editEndedAt(t, "07:45", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "ended_before_started",
    });
  });

  it("実行中タスクにはまだ終了時刻がない", () => {
    expect(editEndedAt(task({ id: 1, startedAt: atJst("08:00") }), "09:00", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "not_punched",
    });
  });

  it("開始打刻のないタスクは終了時刻を持てない（ck_tasks_time と同じ制約）", () => {
    expect(editEndedAt(task({ id: 1 }), "09:00", APP_TIME_ZONE)).toEqual({
      ok: false,
      error: "no_started_at",
    });
  });

  it("時刻として成立しない入力は invalid_time を伝播する", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editEndedAt(t, "abc", APP_TIME_ZONE)).toEqual({ ok: false, error: "invalid_time" });
  });
});
