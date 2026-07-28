import { describe, expect, it } from "vitest";
import type { Section } from "../section/section";
import { atJst } from "../shared/testing/clock";
import { APP_TIME_ZONE } from "../shared/time-zone";
import { groupTasksBySection } from "./daily-list";
import {
  formatProjectedEnd,
  formatProjectedStart,
  isOverMidnight,
  projectedEndTime,
  projectedStartTimes,
  remainingMinutes,
  sectionCapacityMinutes,
  sectionEndAt,
  sectionSlacks,
} from "./projection";
import type { Task } from "./task";
import { task } from "./testing/task";

// 終了予定・セクション残り時間は運用タイムゾーン（`APP_TIME_ZONE`）の壁時計を基準に導出するため、
// 期待値も同じ壁時計で組む（`atJst`）。実行環境の TZ には依らない（T-47）

describe("remainingMinutes（F-104 / データモデル定義書 §4.3）", () => {
  it("未実行タスクの見積もりを合計する", () => {
    const tasks = [task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 45 })];
    expect(remainingMinutes(tasks, atJst("09:00"))).toBe(75);
  });

  it("完了タスクは残時間に含めない", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 30, startedAt: atJst("08:00"), endedAt: atJst("08:30") }),
      task({ id: 2, estimateMinutes: 45 }),
    ];
    expect(remainingMinutes(tasks, atJst("09:00"))).toBe(45);
  });

  it("実行中タスクは「見積もり − 経過」を残りとして加える", () => {
    const tasks = [task({ id: 1, estimateMinutes: 30, startedAt: atJst("08:50") })]; // 経過10分
    expect(remainingMinutes(tasks, atJst("09:00"))).toBe(20);
  });

  it("実行中タスクが見積もりを超過していても残りは0（マイナスにしない）", () => {
    const tasks = [task({ id: 1, estimateMinutes: 10, startedAt: atJst("08:00") })]; // 経過60分
    expect(remainingMinutes(tasks, atJst("09:00"))).toBe(0);
  });

  it("見積もり未設定（0分）は計算に含まれない（画面定義書01 §3.3）", () => {
    const tasks = [task({ id: 1, estimateMinutes: 0 }), task({ id: 2, estimateMinutes: 30 })];
    expect(remainingMinutes(tasks, atJst("09:00"))).toBe(30);
  });

  it("タスクが0件なら0分", () => {
    expect(remainingMinutes([], atJst("09:00"))).toBe(0);
  });
});

describe("projectedEndTime（F-104: 現在時刻 + 残時間）", () => {
  it("現在時刻に残時間を足した時刻を返す", () => {
    const tasks = [task({ id: 1, estimateMinutes: 90 })];
    expect(projectedEndTime(tasks, atJst("09:00"))).toEqual(atJst("10:30"));
  });
});

describe("projectedStartTimes（F-120 / データモデル定義書 §4.3: 未実行タスクの予想開始時刻）", () => {
  it("表示順に並べた未実行タスクを現在時刻から積み上げる", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 30 }),
      task({ id: 2, estimateMinutes: 45 }),
      task({ id: 3, estimateMinutes: 15 }),
    ];
    const starts = projectedStartTimes(tasks, atJst("09:00"));
    expect(starts.get(1)).toEqual(atJst("09:00"));
    expect(starts.get(2)).toEqual(atJst("09:30"));
    expect(starts.get(3)).toEqual(atJst("10:15"));
  });

  it("実行中タスクの残り（見積もり − 経過）を積み上げの起点に含める", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 30, startedAt: atJst("08:50") }), // 経過10分・残り20分
      task({ id: 2, estimateMinutes: 45 }),
    ];
    const starts = projectedStartTimes(tasks, atJst("09:00"));
    expect(starts.get(2)).toEqual(atJst("09:20"));
  });

  it("実行中タスクが見積もりを超過していても残りは0として起点に含める", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 10, startedAt: atJst("08:00") }), // 経過60分
      task({ id: 2, estimateMinutes: 45 }),
    ];
    expect(projectedStartTimes(tasks, atJst("09:00")).get(2)).toEqual(atJst("09:00"));
  });

  it("未実行行より後ろに実行中タスクがあっても、その残りは起点に含める（§4.3 の式）", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 45 }),
      task({ id: 2, estimateMinutes: 30, startedAt: atJst("08:50") }), // 経過10分・残り20分
    ];
    expect(projectedStartTimes(tasks, atJst("09:00")).get(1)).toEqual(atJst("09:20"));
  });

  it("実行中・完了タスクには予想開始時刻を持たせない（対象は未実行行のみ。画面定義書01 §3.3）", () => {
    const tasks = [
      task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") }), // 完了
      task({ id: 2, startedAt: atJst("08:50") }), // 実行中
      task({ id: 3 }), // 未実行
    ];
    const starts = projectedStartTimes(tasks, atJst("09:00"));
    expect(starts.has(1)).toBe(false);
    expect(starts.has(2)).toBe(false);
    expect(starts.has(3)).toBe(true);
  });

  it("完了タスクは積み上げに加えない", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 60, startedAt: atJst("08:00"), endedAt: atJst("08:30") }),
      task({ id: 2, estimateMinutes: 30 }),
    ];
    expect(projectedStartTimes(tasks, atJst("09:00")).get(2)).toEqual(atJst("09:00"));
  });

  it("見積もり未設定（0分）は0として積むため、直前のタスクと同じ時刻になる", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 30 }),
      task({ id: 2, estimateMinutes: 0 }),
      task({ id: 3, estimateMinutes: 15 }),
    ];
    const starts = projectedStartTimes(tasks, atJst("09:00"));
    expect(starts.get(2)).toEqual(atJst("09:30"));
    expect(starts.get(3)).toEqual(atJst("09:30"));
  });

  it("sectionId を見ずに積み上げを続ける（セクションをまたいでもリセットせず、セクション開始時刻を起点にしない）", () => {
    // 表示順の列（未分類 → セクション → sort_order。画面定義書01 §3.2）で渡す。
    // 未分類（sectionId: null）が起点側に来ても、セクションの境目でも 9:00 起点の積み上げが続く
    const tasks = [
      task({ id: 1, sectionId: null, estimateMinutes: 30 }),
      task({ id: 2, sectionId: 1, estimateMinutes: 45 }),
      task({ id: 3, sectionId: 2, estimateMinutes: 15 }),
    ];
    const starts = projectedStartTimes(tasks, atJst("09:00"));
    expect(starts.get(2)).toEqual(atJst("09:30"));
    expect(starts.get(3)).toEqual(atJst("10:15"));
  });

  it("秒を含む現在時刻でもそのまま積み上げる（表示側で切り捨てる）", () => {
    const now = new Date(atJst("09:00").getTime() + 40_000);
    const tasks = [task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 15 })];
    expect(projectedStartTimes(tasks, now)).toEqual(
      new Map([
        [1, now],
        [2, new Date(atJst("09:30").getTime() + 40_000)],
      ])
    );
  });

  it("最後の未実行タスクの予想開始 + その見積もり = 終了予定時刻（F-104 と同じ積み上げの途中経過）", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 30, startedAt: atJst("08:50") }), // 実行中・残り20分
      task({ id: 2, estimateMinutes: 45 }),
      task({ id: 3, estimateMinutes: 15 }),
    ];
    const now = atJst("09:00");
    const starts = projectedStartTimes(tasks, now);
    expect(starts.get(2)).toEqual(atJst("09:20")); // 実行中の残り20分ぶんずれる
    expect(starts.get(3)).toEqual(atJst("10:05")); // + 45分
    expect(projectedEndTime(tasks, now)).toEqual(atJst("10:20")); // + 15分
    // 終了予定 − 末尾タスクの見積もり = 末尾タスクの予想開始（同じ積み上げの途中経過であること）
    expect(starts.get(3)).toEqual(new Date(projectedEndTime(tasks, now).getTime() - 15 * 60_000));
  });

  it("タスクが0件なら空", () => {
    expect(projectedStartTimes([], atJst("09:00")).size).toBe(0);
  });
});

describe("formatProjectedStart（F-120 / 画面定義書01 §3.3 の `HH:MM-` 形式。区切りは実打刻と同じ en dash）", () => {
  it("時を2桁ゼロ埋めした `HH:MM–` を返す（実打刻と同じ列で桁が揃う）", () => {
    expect(formatProjectedStart(atJst("09:05"), atJst("09:00"), APP_TIME_ZONE)).toBe("09:05–");
    expect(formatProjectedStart(atJst("21:45"), atJst("09:00"), APP_TIME_ZONE)).toBe("21:45–");
  });

  it("24:00を超えたら終了予定と同じ折返し表記（`25:30–`）", () => {
    const nextDay = atJst("01:30", "2026-07-27");
    expect(formatProjectedStart(nextDay, atJst("22:00"), APP_TIME_ZONE)).toBe("25:30–");
  });

  it("ちょうど24:00は `24:00-`（ゼロ埋めで桁を壊さない）", () => {
    expect(formatProjectedStart(atJst("00:00", "2026-07-27"), atJst("22:00"), APP_TIME_ZONE)).toBe(
      "24:00–"
    );
  });

  it("秒は切り捨てる（実打刻の表示と同じ扱い）", () => {
    const withSeconds = new Date(atJst("09:30").getTime() + 40_000);
    expect(formatProjectedStart(withSeconds, atJst("09:00"), APP_TIME_ZONE)).toBe("09:30–");
  });

  it("折返しは論理日の区切り（日界 F-116）を基準にする", () => {
    // 日界 06:00・now 23:00（論理日は 07-26）→ 翌 03:00 は 27:00
    expect(
      formatProjectedStart(atJst("03:00", "2026-07-27"), atJst("23:00"), APP_TIME_ZONE, 6 * 60)
    ).toBe("27:00–");
    // 日界 06:00・now 02:00 は論理日が前の暦日（07-25）になり、起点も前の暦日 0:00 → 05:00 は 29:00
    expect(formatProjectedStart(atJst("05:00"), atJst("02:00"), APP_TIME_ZONE, 6 * 60)).toBe(
      "29:00–"
    );
  });
});

describe("F-120: 積み上げの結果が日をまたぐ場合の見え方（§4.3 + 画面定義書01 §3.3）", () => {
  it("翌 01:30 に達する予想開始は折返し表記の `25:30-` になる", () => {
    const now = atJst("22:00");
    const tasks = [
      task({ id: 1, estimateMinutes: 90 }),
      task({ id: 2, estimateMinutes: 120 }),
      task({ id: 3, estimateMinutes: 30 }),
    ];
    // 取れなければ下の1本目で落ちる（`?? now` は Map の戻り型都合のフォールバック）
    const start = projectedStartTimes(tasks, now).get(3) ?? now;
    expect(start).toEqual(atJst("01:30", "2026-07-27"));
    expect(formatProjectedStart(start, now, APP_TIME_ZONE)).toBe("25:30–");
  });
});

describe("formatProjectedEnd（F-104: 24:00超過は翌日表記）", () => {
  it("当日内はそのままの時刻表記", () => {
    expect(formatProjectedEnd(atJst("21:45"), atJst("09:00"), APP_TIME_ZONE)).toBe("21:45");
  });

  it("24:00を超えたら 25:30 のように表記する", () => {
    const nextDay = atJst("01:30", "2026-07-27");
    expect(formatProjectedEnd(nextDay, atJst("22:00"), APP_TIME_ZONE)).toBe("25:30");
  });

  it("ちょうど24:00は 24:00 と表記する", () => {
    const midnight = atJst("00:00", "2026-07-27");
    expect(formatProjectedEnd(midnight, atJst("22:00"), APP_TIME_ZONE)).toBe("24:00");
  });

  it("折返しの起点は運用タイムゾーンの暦日 0:00（実行環境のローカル時刻に依らない）", () => {
    // JST 07-27 01:30（= 07-26T16:30Z）を JST 07-26 22:00（= 13:00Z）から見て 25:30
    expect(
      formatProjectedEnd(
        new Date("2026-07-26T16:30:00Z"),
        new Date("2026-07-26T13:00:00Z"),
        APP_TIME_ZONE
      )
    ).toBe("25:30");
  });

  it("起点の暦日は引数のタイムゾーンで決まる（定数を直接見ていない）", () => {
    // 同じ2つの瞬間を UTC で読むと now は 07-26 13:00・終了は同日 16:30 なので折返さない
    expect(
      formatProjectedEnd(new Date("2026-07-26T16:30:00Z"), new Date("2026-07-26T13:00:00Z"), "UTC")
    ).toBe("16:30");
  });

  it("now の秒は起点に持ち込まない（暦日 0:00 が59秒ずれると表記が1分ずれる）", () => {
    const nowWithSeconds = new Date(atJst("09:00").getTime() + 40_000);
    expect(formatProjectedEnd(atJst("21:45"), nowWithSeconds, APP_TIME_ZONE)).toBe("21:45");
    expect(isOverMidnight(atJst("00:00", "2026-07-27"), nowWithSeconds, APP_TIME_ZONE)).toBe(true);
  });
});

describe("isOverMidnight（F-104: 警告色の判定）", () => {
  it("当日内なら false", () => {
    expect(isOverMidnight(atJst("23:59"), atJst("09:00"), APP_TIME_ZONE)).toBe(false);
  });

  it("24:00以降なら true", () => {
    expect(isOverMidnight(atJst("00:00", "2026-07-27"), atJst("09:00"), APP_TIME_ZONE)).toBe(true);
  });
});

describe("F-116: 折返し表記・超過警告を日界（論理日）基準で測る", () => {
  const DAY_START = 6 * 60; // 日界 06:00

  it("日界 06:00 で翌 03:00 終了は 27:00 表記（暦日ではなく論理日起点）", () => {
    const end = atJst("03:00", "2026-07-27");
    expect(formatProjectedEnd(end, atJst("23:00"), APP_TIME_ZONE, DAY_START)).toBe("27:00");
  });

  it("日界 06:00 では次の日界（翌 06:00）を越えるまで警告しない", () => {
    expect(
      isOverMidnight(atJst("03:00", "2026-07-27"), atJst("23:00"), APP_TIME_ZONE, DAY_START)
    ).toBe(false);
    expect(
      isOverMidnight(atJst("07:00", "2026-07-27"), atJst("23:00"), APP_TIME_ZONE, DAY_START)
    ).toBe(true);
  });

  it("日界より前（深夜帯）の now は論理日が前の暦日になり、起点も前の暦日", () => {
    // 日界 06:00 で now 02:00（論理日は前日）。05:00 終了は前日 0:00 起点で 29:00
    expect(formatProjectedEnd(atJst("05:00"), atJst("02:00"), APP_TIME_ZONE, DAY_START)).toBe(
      "29:00"
    );
    // 前日の日界=当日06:00までは収まる
    expect(isOverMidnight(atJst("05:00"), atJst("02:00"), APP_TIME_ZONE, DAY_START)).toBe(false);
    expect(isOverMidnight(atJst("07:00"), atJst("02:00"), APP_TIME_ZONE, DAY_START)).toBe(true);
  });

  it("論理日が前の暦日になるとき、月初・年初もまたげる（暦日の繰り下がり）", () => {
    // 日界 06:00・now 08-01 02:00 → 論理日は 07-31。起点は 07-31 0:00 なので 05:00 は 29:00
    expect(
      formatProjectedEnd(
        atJst("05:00", "2026-08-01"),
        atJst("02:00", "2026-08-01"),
        APP_TIME_ZONE,
        DAY_START
      )
    ).toBe("29:00");
    // 年初も同じ（now 2027-01-01 02:00 → 論理日は 2026-12-31）
    expect(
      formatProjectedEnd(
        atJst("05:00", "2027-01-01"),
        atJst("02:00", "2027-01-01"),
        APP_TIME_ZONE,
        DAY_START
      )
    ).toBe("29:00");
  });

  it("ちょうど次の日界（翌 06:00）で超過＝true。折返し表記は論理日の暦日0:00起点なので 30:00", () => {
    const nextDayStart = atJst("06:00", "2026-07-27"); // 07-26 の論理日の終わり = 翌 06:00
    expect(isOverMidnight(nextDayStart, atJst("23:00"), APP_TIME_ZONE, DAY_START)).toBe(true);
    expect(formatProjectedEnd(nextDayStart, atJst("23:00"), APP_TIME_ZONE, DAY_START)).toBe("30:00");
  });
});

describe("sectionCapacityMinutes（F-110: セクション枠の長さ）", () => {
  it("開始から終了までの分数を返す", () => {
    expect(sectionCapacityMinutes("06:00", "09:00")).toBe(180);
  });

  it("日をまたぐ枠（夜 18:00–00:00）も正しく求める", () => {
    expect(sectionCapacityMinutes("18:00", "00:00")).toBe(360);
  });

  it("有効セクションが1件で先頭へ折り返す場合は24時間", () => {
    expect(sectionCapacityMinutes("06:00", "06:00")).toBe(24 * 60);
  });
});

describe("sectionEndAt（F-110: セクション終了時刻の絶対時刻）", () => {
  it("基準時刻と同じ暦日の壁時計として終了時刻を返す", () => {
    // 基準 2026-07-26 09:00、終了 12:00 → 同日 12:00
    expect(sectionEndAt(atJst("09:00"), "09:00", "12:00", APP_TIME_ZONE).getTime()).toBe(
      atJst("12:00").getTime()
    );
  });

  it("日をまたぐ枠（終了 ≤ 開始）は翌日へずらす", () => {
    // 夜 18:00–00:00 は基準日翌日の 0:00
    const end = sectionEndAt(atJst("20:00"), "18:00", "00:00", APP_TIME_ZONE);
    expect(end.getTime()).toBe(atJst("00:00", "2026-07-27").getTime());
  });

  it("開始=終了（1件で先頭へ折り返す枠）は翌日の同時刻", () => {
    const end = sectionEndAt(atJst("08:00"), "06:00", "06:00", APP_TIME_ZONE);
    expect(end.getTime()).toBe(atJst("06:00", "2026-07-27").getTime());
  });

  it("枠の起点は運用タイムゾーンの暦日（実行環境のローカル時刻に依らない）", () => {
    // JST 07-26 09:00 = 00:00Z。09:00–12:00 の終わりは JST 12:00 = 03:00Z
    const end = sectionEndAt(new Date("2026-07-26T00:00:00Z"), "09:00", "12:00", APP_TIME_ZONE);
    expect(end.toISOString()).toBe("2026-07-26T03:00:00.000Z");
  });

  it("枠の起点の暦日は引数のタイムゾーンで決まる（定数を直接見ていない）", () => {
    // 同じ瞬間を UTC で読むと暦日 07-26 の 00:00 起点なので、09:00–12:00 の終わりは 12:00Z
    const end = sectionEndAt(new Date("2026-07-26T00:00:00Z"), "09:00", "12:00", "UTC");
    expect(end.toISOString()).toBe("2026-07-26T12:00:00.000Z");
  });

  it("日界 06:00 のとき、回転で末尾に来る深夜(00:00–06:00)は翌暦日に敷かれる（F-116）", () => {
    // now 07-26 20:00、日界 06:00。深夜は論理日の末尾＝翌 00:00–06:00
    const end = sectionEndAt(atJst("20:00"), "00:00", "06:00", APP_TIME_ZONE, 6 * 60);
    expect(end.getTime()).toBe(atJst("06:00", "2026-07-27").getTime());
  });

  it("日界 06:00 の日界セクション（朝 06:00–09:00）は当日 09:00 で終わる（F-116）", () => {
    const end = sectionEndAt(atJst("20:00"), "06:00", "09:00", APP_TIME_ZONE, 6 * 60);
    expect(end.getTime()).toBe(atJst("09:00").getTime());
  });

  it("日界より前（深夜帯）の now では、深夜枠は翌暦日ではなく直近の日界で閉じる（F-116）", () => {
    // now 07-26 02:00・日界 06:00 → 論理日は 07-25。深夜(00:00–06:00)の終わりは当日(07-26) 06:00
    const end = sectionEndAt(atJst("02:00"), "00:00", "06:00", APP_TIME_ZONE, 6 * 60);
    expect(end.getTime()).toBe(atJst("06:00").getTime());
  });
});

describe("sectionSlacks（F-110: セクションの残り時間 / データモデル定義書 §4.3）", () => {
  // 有効セクションは24時間を敷き詰める（§3.1）ので、最後の枠は次の日界まで伸びる:
  // 朝 06:00–09:00（3h）/ 午前 09:00–13:00（4h）/ 午後 13:00–翌06:00（17h）
  const MORNING = 1;
  const FORENOON = 2;
  const AFTERNOON = 3;
  const SECTIONS: readonly Section[] = [
    { id: MORNING, name: "朝", startTime: "06:00", isArchived: false },
    { id: FORENOON, name: "午前", startTime: "09:00", isArchived: false },
    { id: AFTERNOON, name: "午後", startTime: "13:00", isArchived: false },
  ];

  /** グループは実際の集約（§3.2）で組む——各セクションの `tasks` と `endTime` が要るため */
  function slacksOf(tasks: readonly Task[], now: Date, sections = SECTIONS) {
    return sectionSlacks(groupTasksBySection(tasks, sections), now, APP_TIME_ZONE);
  }

  it("現在のセクションは 枠の終了 − 現在時刻 − 未完了見積もり", () => {
    const slacks = slacksOf(
      [task({ id: 1, sectionId: FORENOON, estimateMinutes: 30 })],
      atJst("10:00")
    );
    // 10:00 から30分 → 10:30。13:00 まで150分
    expect(slacks.get(FORENOON)?.slackMinutes).toBe(150);
  });

  it("まだ始まっていないセクションは枠の頭から測る（現在時刻に引きずられない。FB-80）", () => {
    const slacks = slacksOf(
      [task({ id: 1, sectionId: AFTERNOON, estimateMinutes: 60 })],
      atJst("10:00")
    );
    // 13:00 から60分 → 14:00。翌06:00 まで16時間。
    // 現在時刻を起点にすると (翌06:00 − 10:00) − 60分 = 19時間 と枠(17時間)を超える
    expect(slacks.get(AFTERNOON)?.slackMinutes).toBe(16 * 60);
  });

  it("枠に収まらないと残りはマイナスになる", () => {
    const slacks = slacksOf(
      [task({ id: 1, sectionId: FORENOON, estimateMinutes: 240 })],
      atJst("10:00")
    );
    // 10:00 から240分 → 14:00。13:00 を1時間超える
    expect(slacks.get(FORENOON)?.slackMinutes).toBe(-60);
  });

  it("あるセクションが溢れても、他のセクションの残りは変わらない（FB-81）", () => {
    const overflowing = [
      task({ id: 1, sectionId: FORENOON, estimateMinutes: 240 }), // 午前は1時間溢れる
      task({ id: 2, sectionId: AFTERNOON, estimateMinutes: 60 }),
    ];
    const alone = [task({ id: 2, sectionId: AFTERNOON, estimateMinutes: 60 })];

    // 午前が本当に溢れている前提を固定する（ここが崩れると下の対比が黙って無力化する）
    expect(slacksOf(overflowing, atJst("10:00")).get(FORENOON)?.slackMinutes).toBe(-60);
    // 午後の値は、午前が溢れていてもいなくても同じ（13:00 から60分 → 翌06:00 まで16時間）
    expect(slacksOf(overflowing, atJst("10:00")).get(AFTERNOON)?.slackMinutes).toBe(16 * 60);
    expect(slacksOf(alone, atJst("10:00")).get(AFTERNOON)?.slackMinutes).toBe(16 * 60);
  });

  it("溢れは2つ先のセクションにも及ばない（FB-81）", () => {
    const slacks = slacksOf(
      [
        task({ id: 1, sectionId: MORNING, estimateMinutes: 600 }), // 朝が大きく溢れる
        task({ id: 2, sectionId: AFTERNOON, estimateMinutes: 60 }),
      ],
      atJst("07:00")
    );
    // 午前（タスクなし）も午後も、朝の溢れに押されない
    expect(slacks.get(FORENOON)?.slackMinutes).toBe(4 * 60);
    expect(slacks.get(AFTERNOON)?.slackMinutes).toBe(16 * 60);
  });

  it("将来のセクションでも自分の枠を超えればマイナスになる", () => {
    const slacks = slacksOf(
      [task({ id: 1, sectionId: AFTERNOON, estimateMinutes: 18 * 60 })],
      atJst("10:00")
    );
    // 13:00 から18時間 → 枠（17時間）を1時間超える
    expect(slacks.get(AFTERNOON)?.slackMinutes).toBe(-60);
  });

  it("枠ちょうどに収まると 0、1分超えると -1（警告色の分かれ目。画面定義書01 §3.2）", () => {
    const exact = slacksOf(
      [task({ id: 1, sectionId: FORENOON, estimateMinutes: 180 })], // 10:00 → 13:00 ちょうど
      atJst("10:00")
    );
    expect(exact.get(FORENOON)?.slackMinutes).toBe(0);

    const over = slacksOf(
      [task({ id: 1, sectionId: FORENOON, estimateMinutes: 181 })],
      atJst("10:00")
    );
    expect(over.get(FORENOON)?.slackMinutes).toBe(-1);
  });

  it("将来のセクションが枠ちょうどでも 0（枠の頭から測るため）", () => {
    const slacks = slacksOf(
      [task({ id: 1, sectionId: AFTERNOON, estimateMinutes: 17 * 60 })],
      atJst("10:00")
    );
    expect(slacks.get(AFTERNOON)?.slackMinutes).toBe(0);
  });

  it("秒を含む現在時刻でも分は切り捨てる（プラス側もマイナス側も）", () => {
    // 本番の now は秒を持つ（`useNow` は new Date() をそのまま返す）
    const withSeconds = new Date(atJst("10:00").getTime() + 20_000);

    // 10:00:20 から30分 → 10:30:20。13:00 まで 149分40秒 → 149（round なら 150）
    const plus = slacksOf([task({ id: 1, sectionId: FORENOON, estimateMinutes: 30 })], withSeconds);
    expect(plus.get(FORENOON)?.slackMinutes).toBe(149);

    // 10:00:20 から240分 → 14:00:20。13:00 まで -60分20秒 → -61（trunc なら -60）
    const minus = slacksOf(
      [task({ id: 1, sectionId: FORENOON, estimateMinutes: 240 })],
      withSeconds
    );
    expect(minus.get(FORENOON)?.slackMinutes).toBe(-61);
  });

  it("他のセクションのタスクは残りに影響しない（未分類・過去のやり残しも同じ）", () => {
    const slacks = slacksOf(
      [
        task({ id: 1, sectionId: null, estimateMinutes: 120 }), // 未分類
        task({ id: 2, sectionId: MORNING, estimateMinutes: 60 }), // 朝のやり残し（09:00 に終了済み）
        task({ id: 3, sectionId: FORENOON, estimateMinutes: 30 }),
      ],
      atJst("10:00")
    );
    expect(slacks.get(FORENOON)?.slackMinutes).toBe(150); // 自分の30分だけで決まる
    expect(slacks.size).toBe(3); // 枠を持たない未分類のエントリは増えない
  });

  it("アーカイブ済みセクションは枠が定まらないので残りを返さない", () => {
    const ARCHIVED = 9;
    const sections = [
      ...SECTIONS,
      { id: ARCHIVED, name: "旧朝活", startTime: "07:00", isArchived: true },
    ];
    const slacks = slacksOf(
      [
        task({ id: 1, sectionId: ARCHIVED, estimateMinutes: 60 }),
        task({ id: 2, sectionId: FORENOON, estimateMinutes: 30 }),
      ],
      atJst("10:00"),
      sections
    );
    expect(slacks.has(ARCHIVED)).toBe(false);
    expect(slacks.get(FORENOON)?.slackMinutes).toBe(150); // 旧朝活の60分にも影響されない
  });

  it("完了タスクは数えず、実行中は残り見積もり（見積もり − 経過）で数える", () => {
    const slacks = slacksOf(
      [
        task({
          id: 1,
          sectionId: FORENOON,
          estimateMinutes: 60,
          startedAt: atJst("09:00"),
          endedAt: atJst("09:40"),
        }),
        task({ id: 2, sectionId: FORENOON, estimateMinutes: 30, startedAt: atJst("09:50") }),
      ],
      atJst("10:00")
    );
    // 完了は0・実行中は残り20分 → 10:20。13:00 まで160分
    expect(slacks.get(FORENOON)?.slackMinutes).toBe(160);
  });

  it("枠の終了時刻も返す（表示するかの判定に呼び出し側が使う。画面定義書01 §3.2）", () => {
    const slacks = slacksOf([], atJst("10:00"));
    expect(slacks.get(FORENOON)?.endAt.getTime()).toBe(atJst("13:00").getTime());
  });

  it("タスクのない将来セクションの残りは枠の長さちょうど（枠を超えない。FB-80）", () => {
    const slacks = slacksOf([], atJst("10:00"));
    // 午後は 13:00–翌06:00 の17時間。旧式なら (翌06:00 − 10:00) = 20時間 になっていた
    expect(slacks.get(AFTERNOON)?.slackMinutes).toBe(17 * 60);
  });

  it("回転（F-116）で表示順と start_time 順がずれても、枠は start_time 順の次セクション開始で決まる", () => {
    // 日界 09:00 → 表示順は 午前 → 午後 → 朝（朝の枠は翌 06:00–09:00 へ回る）
    const sections = SECTIONS.map((s) =>
      s.id === FORENOON ? { ...s, isDayStart: true } : s
    );
    const groups = groupTasksBySection(
      [
        task({ id: 1, sectionId: FORENOON, estimateMinutes: 60 }),
        task({ id: 2, sectionId: AFTERNOON, estimateMinutes: 60 }),
      ],
      sections
    );
    const slacks = sectionSlacks(groups, atJst("10:00"), APP_TIME_ZONE, 9 * 60);

    // 午前: 10:00 から60分 → 11:00。13:00 まで120分
    expect(slacks.get(FORENOON)?.slackMinutes).toBe(120);
    // 午後: 13:00 から60分 → 14:00。枠の終わりは回転に依らず次の開始＝翌06:00（§3.1）なので16時間
    expect(slacks.get(AFTERNOON)?.slackMinutes).toBe(16 * 60);
    // 朝は回転で末尾へ回り、枠も翌 06:00–09:00 になる（タスクが無いので枠まるごと）
    expect(slacks.get(MORNING)?.slackMinutes).toBe(3 * 60);
  });

  it("日界（F-116）を跨ぐ枠でも論理日の区切りで測る", () => {
    // 日界 06:00・深夜 02:00 は前の論理日の続き。午後（13:00–翌06:00）はまだ終わっていない
    const groups = groupTasksBySection(
      [task({ id: 1, sectionId: AFTERNOON, estimateMinutes: 60 })],
      SECTIONS.map((s) => (s.id === MORNING ? { ...s, isDayStart: true } : s))
    );
    const slacks = sectionSlacks(groups, atJst("02:00"), APP_TIME_ZONE, 6 * 60);
    // 枠はもう始まっているので 02:00 から60分 → 03:00。06:00 まで180分
    expect(slacks.get(AFTERNOON)?.slackMinutes).toBe(180);
  });
});
