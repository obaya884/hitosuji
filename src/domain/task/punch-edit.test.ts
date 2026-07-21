import { describe, expect, it } from "vitest";
import { applyClockTime, editEndedAt, editStartedAt } from "./punch-edit";
import type { Task } from "./task";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: "メールチェック",
    estimateMinutes: 30,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

// ローカル時刻で構築する（打刻の修正は利用者のタイムゾーンで行う）
function at(hours: number, minutes: number): Date {
  return new Date(2026, 6, 19, hours, minutes, 0, 0);
}

describe("applyClockTime（F-203: HH:MM を直接修正する）", () => {
  it("元の打刻と同じ日の指定時刻にする（秒・ミリ秒は落とす）", () => {
    const base = new Date(2026, 6, 19, 8, 30, 45, 123);
    const result = applyClockTime(base, "09:05");
    expect(result).toEqual({ ok: true, value: at(9, 5) });
  });

  it("区切り文字なしの入力も受け付ける（1935 → 19:35、935 → 9:35）", () => {
    const base = at(8, 0);
    expect(applyClockTime(base, "1935")).toEqual({ ok: true, value: at(19, 35) });
    expect(applyClockTime(base, "935")).toEqual({ ok: true, value: at(9, 35) });
    expect(applyClockTime(base, "0005")).toEqual({ ok: true, value: at(0, 5) });
  });

  it("1桁の時も受け付ける（9:05）", () => {
    expect(applyClockTime(at(8, 0), "9:05")).toEqual({ ok: true, value: at(9, 5) });
  });

  it("前後の空白は無視する", () => {
    expect(applyClockTime(at(8, 0), " 19:35 ")).toEqual({ ok: true, value: at(19, 35) });
  });

  it("時刻として成立しない入力は確定不可（§8）", () => {
    const base = at(8, 0);
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
    const t = task({ id: 1, startedAt: at(8, 0) });
    expect(editStartedAt(t, "07:30")).toEqual({ ok: true, value: at(7, 30) });
  });

  it("完了タスクでも終了時刻を超えなければ修正できる", () => {
    const t = task({ id: 1, startedAt: at(8, 0), endedAt: at(8, 30) });
    expect(editStartedAt(t, "08:15")).toEqual({ ok: true, value: at(8, 15) });
  });

  it("終了時刻より後の開始時刻は確定不可", () => {
    const t = task({ id: 1, startedAt: at(8, 0), endedAt: at(8, 30) });
    expect(editStartedAt(t, "08:45")).toEqual({ ok: false, error: "ended_before_started" });
  });

  it("未実行タスクには開始時刻がない", () => {
    expect(editStartedAt(task({ id: 1 }), "08:00")).toEqual({ ok: false, error: "not_punched" });
  });

  it("時刻として成立しない入力は invalid_time を伝播する", () => {
    const t = task({ id: 1, startedAt: at(8, 0) });
    expect(editStartedAt(t, "99:99")).toEqual({ ok: false, error: "invalid_time" });
  });
});

describe("editEndedAt（F-203: 開始 ≦ 終了 の整合性チェック）", () => {
  it("完了タスクの終了時刻を修正できる", () => {
    const t = task({ id: 1, startedAt: at(8, 0), endedAt: at(8, 30) });
    expect(editEndedAt(t, "08:45")).toEqual({ ok: true, value: at(8, 45) });
  });

  it("開始時刻より前の終了時刻は確定不可", () => {
    const t = task({ id: 1, startedAt: at(8, 0), endedAt: at(8, 30) });
    expect(editEndedAt(t, "07:45")).toEqual({ ok: false, error: "ended_before_started" });
  });

  it("実行中タスクにはまだ終了時刻がない", () => {
    expect(editEndedAt(task({ id: 1, startedAt: at(8, 0) }), "09:00")).toEqual({
      ok: false,
      error: "not_punched",
    });
  });

  it("開始打刻のないタスクは終了時刻を持てない（ck_tasks_time と同じ制約）", () => {
    expect(editEndedAt(task({ id: 1 }), "09:00")).toEqual({ ok: false, error: "no_started_at" });
  });

  it("時刻として成立しない入力は invalid_time を伝播する", () => {
    const t = task({ id: 1, startedAt: at(8, 0), endedAt: at(8, 30) });
    expect(editEndedAt(t, "abc")).toEqual({ ok: false, error: "invalid_time" });
  });
});
