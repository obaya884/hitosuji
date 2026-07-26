import { describe, expect, it } from "vitest";
import { atLocal } from "../shared/testing/clock";
import { applyClockTime, editEndedAt, editStartedAt } from "./punch-edit";
import { task } from "./testing/task";

// 打刻の修正は入力の `HH:MM` を利用者のタイムゾーンで解釈するため、期待値も
// ローカル壁時計で組む（`atLocal`）

describe("applyClockTime（F-203: HH:MM を直接修正する）", () => {
  it("元の打刻と同じ日の指定時刻にする（秒・ミリ秒は落とす）", () => {
    // 秒・ミリ秒が落ちることを見るので、ここだけ `atLocal`（分までしか持てない）ではなく直に組む
    const base = new Date(2026, 6, 26, 8, 30, 45, 123);
    const result = applyClockTime(base, "09:05");
    expect(result).toEqual({ ok: true, value: atLocal("09:05") });
  });

  it("区切り文字なしの入力も受け付ける（1935 → 19:35、935 → 9:35）", () => {
    const base = atLocal("08:00");
    expect(applyClockTime(base, "1935")).toEqual({ ok: true, value: atLocal("19:35") });
    expect(applyClockTime(base, "935")).toEqual({ ok: true, value: atLocal("09:35") });
    expect(applyClockTime(base, "0005")).toEqual({ ok: true, value: atLocal("00:05") });
  });

  it("1桁の時も受け付ける（9:05）", () => {
    expect(applyClockTime(atLocal("08:00"), "9:05")).toEqual({ ok: true, value: atLocal("09:05") });
  });

  it("前後の空白は無視する", () => {
    expect(applyClockTime(atLocal("08:00"), " 19:35 ")).toEqual({ ok: true, value: atLocal("19:35") });
  });

  it("時刻として成立しない入力は確定不可（§8）", () => {
    const base = atLocal("08:00");
    expect(applyClockTime(base, "24:00")).toEqual({ ok: false, error: "invalid_time" });
    expect(applyClockTime(base, "1961")).toEqual({ ok: false, error: "invalid_time" });
    expect(applyClockTime(base, "12345")).toEqual({ ok: false, error: "invalid_time" });
    expect(applyClockTime(base, "19")).toEqual({ ok: false, error: "invalid_time" });
    expect(applyClockTime(base, "abc")).toEqual({ ok: false, error: "invalid_time" });
    expect(applyClockTime(base, "")).toEqual({ ok: false, error: "invalid_time" });
  });
});

describe("editStartedAt（F-203: 開始 ≦ 終了 の整合性チェック）", () => {
  it("実行中タスクの開始時刻を修正できる", () => {
    const t = task({ id: 1, startedAt: atLocal("08:00") });
    expect(editStartedAt(t, "07:30")).toEqual({ ok: true, value: atLocal("07:30") });
  });

  it("完了タスクでも終了時刻を超えなければ修正できる", () => {
    const t = task({ id: 1, startedAt: atLocal("08:00"), endedAt: atLocal("08:30") });
    expect(editStartedAt(t, "08:15")).toEqual({ ok: true, value: atLocal("08:15") });
  });

  it("終了時刻より後の開始時刻は確定不可", () => {
    const t = task({ id: 1, startedAt: atLocal("08:00"), endedAt: atLocal("08:30") });
    expect(editStartedAt(t, "08:45")).toEqual({ ok: false, error: "ended_before_started" });
  });

  it("未実行タスクには開始時刻がない", () => {
    expect(editStartedAt(task({ id: 1 }), "08:00")).toEqual({ ok: false, error: "not_punched" });
  });

  it("時刻として成立しない入力は invalid_time を伝播する", () => {
    const t = task({ id: 1, startedAt: atLocal("08:00") });
    expect(editStartedAt(t, "99:99")).toEqual({ ok: false, error: "invalid_time" });
  });
});

describe("editEndedAt（F-203: 開始 ≦ 終了 の整合性チェック）", () => {
  it("完了タスクの終了時刻を修正できる", () => {
    const t = task({ id: 1, startedAt: atLocal("08:00"), endedAt: atLocal("08:30") });
    expect(editEndedAt(t, "08:45")).toEqual({ ok: true, value: atLocal("08:45") });
  });

  it("開始時刻より前の終了時刻は確定不可", () => {
    const t = task({ id: 1, startedAt: atLocal("08:00"), endedAt: atLocal("08:30") });
    expect(editEndedAt(t, "07:45")).toEqual({ ok: false, error: "ended_before_started" });
  });

  it("実行中タスクにはまだ終了時刻がない", () => {
    expect(editEndedAt(task({ id: 1, startedAt: atLocal("08:00") }), "09:00")).toEqual({
      ok: false,
      error: "not_punched",
    });
  });

  it("開始打刻のないタスクは終了時刻を持てない（ck_tasks_time と同じ制約）", () => {
    expect(editEndedAt(task({ id: 1 }), "09:00")).toEqual({ ok: false, error: "no_started_at" });
  });

  it("時刻として成立しない入力は invalid_time を伝播する", () => {
    const t = task({ id: 1, startedAt: atLocal("08:00"), endedAt: atLocal("08:30") });
    expect(editEndedAt(t, "abc")).toEqual({ ok: false, error: "invalid_time" });
  });
});
