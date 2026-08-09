import { describe, expect, it } from "vitest";
import { addDays } from "../shared/logical-date";
import { atJst, NEXT_TEST_DATE, TEST_DATE } from "../shared/testing/clock";
import { APP_TIME_ZONE } from "../shared/time-zone";
import { editEndedAt, editStartedAt, parseClockTime, type PunchEditContext } from "./punch-edit";
import { task } from "./testing/task";

// 打刻の修正は入力の `HH:MM` を運用タイムゾーンの壁時計として解釈するので、期待値も
// 同じ壁時計で組む（`atJst`）。実行環境の TZ には依らない（T-47）

/** 日界 06:00。既定の 00:00 では論理日＝暦日で規則の差が出ないため、多くのケースでこれを使う */
const DAY_START_0600 = 6 * 60;

/** 未来判定に掛からない十分に後ろの現在時刻 */
const LATE_NOW = atJst("23:59", NEXT_TEST_DATE);

function context(over: Partial<PunchEditContext> = {}): PunchEditContext {
  return { timeZone: APP_TIME_ZONE, dayStartMinutes: 0, now: LATE_NOW, ...over };
}

describe("parseClockTime（画面定義書01 §3.3: HH:MM の入力形式）", () => {
  it("区切り文字なしの入力も受け付ける（1935 → 19:35、935 → 9:35）", () => {
    expect(parseClockTime("1935")).toEqual({ ok: true, value: { hours: 19, minutes: 35 } });
    expect(parseClockTime("935")).toEqual({ ok: true, value: { hours: 9, minutes: 35 } });
    expect(parseClockTime("0005")).toEqual({ ok: true, value: { hours: 0, minutes: 5 } });
  });

  it("1桁の時も受け付ける（9:05）", () => {
    expect(parseClockTime("9:05")).toEqual({ ok: true, value: { hours: 9, minutes: 5 } });
  });

  it("前後の空白は無視する", () => {
    expect(parseClockTime(" 19:35 ")).toEqual({ ok: true, value: { hours: 19, minutes: 35 } });
  });

  it("時刻として成立しない入力は確定不可（画面定義書01 §8）", () => {
    for (const raw of ["24:00", "1961", "12345", "19", "abc", ""]) {
      expect(parseClockTime(raw)).toEqual({ ok: false, error: "invalid_time" });
    }
  });
});

describe("editStartedAt（F-203: 入力をタスクが属する論理日の時刻として読む）", () => {
  it("日界が既定（00:00）なら論理日の暦日そのものに落ちる", () => {
    const t = task({ id: 1, startedAt: atJst("08:00") });
    expect(editStartedAt(t, "07:30", context())).toEqual({ ok: true, value: atJst("07:30") });
  });

  it("日界以降の時刻は論理日の暦日のまま（F-116 / 画面定義書01 §3.3）", () => {
    const t = task({ id: 1, startedAt: atJst("08:00") });
    expect(editStartedAt(t, "23:40", context({ dayStartMinutes: DAY_START_0600 }))).toEqual({
      ok: true,
      value: atJst("23:40"),
    });
  });

  it("日界より前の時刻は論理日の翌暦日に落ちる（F-116 / 画面定義書01 §3.3）", () => {
    const t = task({ id: 1, startedAt: atJst("08:00") });
    expect(editStartedAt(t, "01:00", context({ dayStartMinutes: DAY_START_0600 }))).toEqual({
      ok: true,
      value: atJst("01:00", NEXT_TEST_DATE),
    });
  });

  it("落とし先は元の打刻の暦日に依らない（深夜に開いたまま前の晩の時刻を入れられる。FB-83）", () => {
    // 論理日 TEST_DATE の深夜側（＝翌暦日 02:00）に打刻したタスクを、前の晩へ直す
    const t = task({ id: 1, startedAt: atJst("02:00", NEXT_TEST_DATE) });
    expect(
      editStartedAt(
        t,
        "23:40",
        context({ dayStartMinutes: DAY_START_0600, now: atJst("02:30", NEXT_TEST_DATE) })
      )
    ).toEqual({ ok: true, value: atJst("23:40") });
  });

  it("未来の開始時刻が入ってしまった行も、過去の時刻へ直して戻せる（FB-83 の復帰経路）", () => {
    // 旧実装が作った「論理日 TEST_DATE のタスクに翌暦日 23:40」という未来の打刻
    const t = task({ id: 1, startedAt: atJst("23:40", NEXT_TEST_DATE) });
    expect(
      editStartedAt(
        t,
        "23:40",
        context({ dayStartMinutes: DAY_START_0600, now: atJst("02:30", NEXT_TEST_DATE) })
      )
    ).toEqual({ ok: true, value: atJst("23:40") });
  });

  it("未来日のタスクに付いた打刻は修正できない（画面定義書01 §3.3。O-13 で取り消す）", () => {
    // 未来日では打刻を受け付けないので画面からこの状態は作れない（§7）。domain は日付を選ばず
    // 呼べるので、論理日が丸ごと未来にある行を渡されたときの答えをここで固定しておく
    const t = task({ id: 1, taskDate: addDays(TEST_DATE, 1), startedAt: atJst("10:00") });
    expect(editStartedAt(t, "09:00", context({ now: atJst("10:30") }))).toEqual({
      ok: false,
      error: "future_time",
    });
  });

  it("解釈に使う壁時計は引数のタイムゾーンで決まる（定数を直接見ていない）", () => {
    const t = task({ id: 1, startedAt: new Date("2026-07-26T00:00:00Z") });
    expect(editStartedAt(t, "07:30", context({ timeZone: "UTC" }))).toEqual({
      ok: true,
      value: new Date("2026-07-26T07:30:00Z"),
    });
  });

  it("未来の時刻へは修正できない（画面定義書01 §3.3・§8）", () => {
    const t = task({ id: 1, startedAt: atJst("02:00", NEXT_TEST_DATE) });
    expect(
      editStartedAt(
        t,
        "03:00", // 日界より前なので翌暦日 03:00 ＝ 現在時刻より後
        context({ dayStartMinutes: DAY_START_0600, now: atJst("02:30", NEXT_TEST_DATE) })
      )
    ).toEqual({ ok: false, error: "future_time" });
  });

  it("現在時刻のちょうど1分後から未来として弾く", () => {
    const t = task({ id: 1, startedAt: atJst("02:00", NEXT_TEST_DATE) });
    const now = new Date(atJst("02:30", NEXT_TEST_DATE).getTime() + 45_000); // 02:30:45
    expect(
      editStartedAt(t, "02:31", context({ dayStartMinutes: DAY_START_0600, now }))
    ).toEqual({ ok: false, error: "future_time" });
  });

  it("現在時刻と同じ分への修正は通る（現在時刻が秒を持っていても）", () => {
    const t = task({ id: 1, startedAt: atJst("02:00", NEXT_TEST_DATE) });
    const now = new Date(atJst("02:30", NEXT_TEST_DATE).getTime() + 45_000); // 02:30:45
    expect(
      editStartedAt(t, "02:30", context({ dayStartMinutes: DAY_START_0600, now }))
    ).toEqual({ ok: true, value: atJst("02:30", NEXT_TEST_DATE) });
  });

  it("完了タスクでも終了時刻を超えなければ修正できる", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editStartedAt(t, "08:15", context())).toEqual({ ok: true, value: atJst("08:15") });
  });

  it("終了時刻より後の開始時刻は確定不可（開始 ≦ 終了）", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editStartedAt(t, "08:45", context())).toEqual({
      ok: false,
      error: "ended_before_started",
    });
  });

  // 日をまたいで走ったタスク（画面定義書01 §8）では、開始が論理日の中・終了が論理日の外に
  // あるので、開始 ≦ 終了 の比較が暦日をまたいだ状態で効く
  it("日をまたいだ完了タスクの開始を、深夜側の時刻へ直せる", () => {
    const t = task({ id: 1, startedAt: atJst("23:00"), endedAt: atJst("01:00", NEXT_TEST_DATE) });
    const now = atJst("10:00", NEXT_TEST_DATE);
    expect(editStartedAt(t, "00:30", context({ dayStartMinutes: DAY_START_0600, now }))).toEqual({
      ok: true,
      value: atJst("00:30", NEXT_TEST_DATE),
    });
  });

  it("日をまたいだ完了タスクでも、終了より後の開始時刻は確定不可", () => {
    const t = task({ id: 1, startedAt: atJst("23:00"), endedAt: atJst("01:00", NEXT_TEST_DATE) });
    const now = atJst("10:00", NEXT_TEST_DATE);
    expect(editStartedAt(t, "02:00", context({ dayStartMinutes: DAY_START_0600, now }))).toEqual({
      ok: false,
      error: "ended_before_started",
    });
  });

  it("未来かつ終了より後のときは未来として弾く（トーストは1つなので先に見るほうが出る）", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editStartedAt(t, "09:00", context({ now: atJst("08:45") }))).toEqual({
      ok: false,
      error: "future_time",
    });
  });

  it("未実行タスクには開始時刻がない", () => {
    expect(editStartedAt(task({ id: 1 }), "08:00", context())).toEqual({
      ok: false,
      error: "not_punched",
    });
  });

  it("時刻として成立しない入力は invalid_time を伝播する", () => {
    const t = task({ id: 1, startedAt: atJst("08:00") });
    expect(editStartedAt(t, "99:99", context())).toEqual({ ok: false, error: "invalid_time" });
  });
});

describe("editEndedAt（F-203: 入力を開始時刻以降で最も早い候補として読む）", () => {
  it("完了タスクの終了時刻を修正できる", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editEndedAt(t, "08:45", context())).toEqual({ ok: true, value: atJst("08:45") });
  });

  it("開始より前の時刻は翌暦日として読む（日をまたいで走ったタスク。画面定義書01 §8）", () => {
    const t = task({ id: 1, startedAt: atJst("23:00"), endedAt: atJst("23:30") });
    expect(editEndedAt(t, "00:10", context({ now: atJst("01:00", NEXT_TEST_DATE) }))).toEqual({
      ok: true,
      value: atJst("00:10", NEXT_TEST_DATE),
    });
  });

  it("日界の設定に依らない（枠は開始時刻で決まる）", () => {
    const t = task({ id: 1, startedAt: atJst("23:00"), endedAt: atJst("23:30") });
    const now = atJst("01:00", NEXT_TEST_DATE);
    const expected = { ok: true, value: atJst("00:10", NEXT_TEST_DATE) };
    expect(editEndedAt(t, "00:10", context({ dayStartMinutes: DAY_START_0600, now }))).toEqual(
      expected
    );
    expect(editEndedAt(t, "00:10", context({ dayStartMinutes: 0, now }))).toEqual(expected);
  });

  it("翌暦日への繰り上がりは月をまたいでも正しい", () => {
    const t = task({
      id: 1,
      startedAt: atJst("23:00", "2026-07-31"),
      endedAt: atJst("23:30", "2026-07-31"),
    });
    expect(editEndedAt(t, "00:10", context({ now: atJst("01:00", "2026-08-01") }))).toEqual({
      ok: true,
      value: atJst("00:10", "2026-08-01"),
    });
  });

  it("解釈に使う壁時計は引数のタイムゾーンで決まる（定数を直接見ていない）", () => {
    // UTC で読むと開始は 07-26 23:00 なので、00:10 は翌暦日 07-27 の 00:10Z
    const t = task({
      id: 1,
      startedAt: new Date("2026-07-26T23:00:00Z"),
      endedAt: new Date("2026-07-26T23:30:00Z"),
    });
    const now = new Date("2026-07-27T02:00:00Z");
    expect(editEndedAt(t, "00:10", context({ timeZone: "UTC", now }))).toEqual({
      ok: true,
      value: new Date("2026-07-27T00:10:00Z"),
    });
  });

  it("開始と同じ分なら翌暦日へ送らず、開始時刻そのものへ寄せる（打刻は秒を持つ / ck_tasks_time）", () => {
    const startedAt = new Date(atJst("08:00").getTime() + 30_000); // 08:00:30
    const t = task({ id: 1, startedAt, endedAt: new Date(startedAt.getTime() + 15_000) });
    // 分の頭（08:00:00）に落とすと絶対時刻では開始より前になり、サーバと DB の制約に触れる
    expect(editEndedAt(t, "08:00", context())).toEqual({ ok: true, value: startedAt });
  });

  it("現在時刻と同じ分への修正は通る（現在時刻が秒を持っていても）", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    const now = new Date(atJst("09:00").getTime() + 30_000); // 09:00:30
    expect(editEndedAt(t, "09:00", context({ now }))).toEqual({ ok: true, value: atJst("09:00") });
  });

  it("未来の時刻へは修正できない（画面定義書01 §3.3・§8）", () => {
    const t = task({ id: 1, startedAt: atJst("23:00"), endedAt: atJst("23:30") });
    // 22:00 は開始より前なので翌暦日と読まれ、現在時刻より後になる
    expect(editEndedAt(t, "22:00", context({ now: atJst("01:00", NEXT_TEST_DATE) }))).toEqual({
      ok: false,
      error: "future_time",
    });
  });

  // 終了時刻の枠は実打刻（開始時刻）で決まるので、開始時刻と違って `task_date` を見ない。
  // 未来日のタスクでも終了時刻は直せる（画面定義書01 §3.3 が開始時刻だけを制限しているのと対）。
  // 上と同じく画面からは作れない状態（§7）で、日付を選ばない domain の答えを固定するためのもの
  it("未来日のタスクでも終了時刻は修正できる（枠は開始時刻で決まる）", () => {
    const t = task({
      id: 1,
      taskDate: addDays(TEST_DATE, 1),
      startedAt: atJst("08:00"),
      endedAt: atJst("08:30"),
    });
    expect(editEndedAt(t, "08:45", context({ now: atJst("10:00") }))).toEqual({
      ok: true,
      value: atJst("08:45"),
    });
  });

  it("実行中タスクにはまだ終了時刻がない", () => {
    expect(editEndedAt(task({ id: 1, startedAt: atJst("08:00") }), "09:00", context())).toEqual({
      ok: false,
      error: "not_punched",
    });
  });

  it("開始打刻のないタスクは終了時刻を持てない（ck_tasks_time と同じ制約）", () => {
    expect(editEndedAt(task({ id: 1 }), "09:00", context())).toEqual({
      ok: false,
      error: "no_started_at",
    });
  });

  it("時刻として成立しない入力は invalid_time を伝播する", () => {
    const t = task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(editEndedAt(t, "abc", context())).toEqual({ ok: false, error: "invalid_time" });
  });
});
