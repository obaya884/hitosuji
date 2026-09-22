import { describe, expect, it } from "vitest";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import {
  formatCarriedOverTo,
  formatCarryOver,
  formatClock,
  formatDuration,
  formatLogicalDate,
  formatSignedDuration,
  normalizeClockInput,
} from "./format";

describe("formatCarryOver（F-122 / 画面定義書01 §3.3: 3日持ち越し（9/18から））", () => {
  it("日数を先に、最初に属した日を括弧で添える", () => {
    const t = task({ id: 1, initialTaskDate: "2026-09-18", taskDate: "2026-09-21" });
    expect(formatCarryOver(t)).toBe("3日持ち越し（9/18から）");
  });

  it("月日はゼロ埋めしない", () => {
    const t = task({ id: 1, initialTaskDate: "2026-01-05", taskDate: "2026-01-06" });
    expect(formatCarryOver(t)).toBe("1日持ち越し（1/5から）");
  });

  it("持ち越していない行では null（何も出さない）", () => {
    expect(formatCarryOver(task({ id: 1, taskDate: "2026-09-21" }))).toBeNull();
  });

  // 条項は `initial_task_date < task_date` のときだけ出す（画面定義書01 §3.3）。
  // 他日から引き寄せる操作（FB-98）が入れば差は負になりうるので、その端も塞いでおく
  it("最初に属した日が表示日より後（負の差）でも null", () => {
    const t = task({ id: 1, initialTaskDate: "2026-09-22", taskDate: "2026-09-21" });
    expect(formatCarryOver(t)).toBeNull();
  });
});

describe("formatCarriedOverTo（F-502 / 画面定義書04 §3.4 ①: 9/22へ持ち越し（3日）・完了）", () => {
  it("送り先の日付・持ち越しの日数・送り先での状態を並べる（完了）", () => {
    const t = task({
      id: 1,
      initialTaskDate: "2026-09-19",
      taskDate: "2026-09-22",
      startedAt: atJst("09:00", "2026-09-22"),
      endedAt: atJst("09:30", "2026-09-22"),
    });
    expect(formatCarriedOverTo(t)).toBe("9/22へ持ち越し（3日）・完了");
  });

  it("送り先で未実行なら「未実行」、実行中なら「実行中」", () => {
    const base = { id: 1, initialTaskDate: "2026-09-19", taskDate: "2026-09-22" };
    expect(formatCarriedOverTo(task(base))).toBe("9/22へ持ち越し（3日）・未実行");
    expect(formatCarriedOverTo(task({ ...base, startedAt: atJst("09:00", "2026-09-22") }))).toBe(
      "9/22へ持ち越し（3日）・実行中"
    );
  });

  it("月日はゼロ埋めしない", () => {
    const t = task({ id: 1, initialTaskDate: "2026-12-31", taskDate: "2027-01-05" });
    expect(formatCarriedOverTo(t)).toBe("1/5へ持ち越し（5日）・未実行");
  });
});

describe("formatDuration（画面定義書01 §3.3: 1分未満の実績は 0:00）", () => {
  it("0分の実績は --:-- ではなく 0:00 と表示する", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("分を H:MM へ整形する", () => {
    expect(formatDuration(18)).toBe("0:18");
    expect(formatDuration(125)).toBe("2:05");
    // 時は2桁でもゼロ埋めしない（分だけ padStart する）
    expect(formatDuration(600)).toBe("10:00");
  });
});

describe("formatSignedDuration（画面定義書04 §3.3 / 画面定義書01 §3.2: 差の向きを符号で示す。0 は符号なし）", () => {
  it("正は `+`・負は `-` を付ける", () => {
    expect(formatSignedDuration(10)).toBe("+0:10");
    expect(formatSignedDuration(-90)).toBe("-1:30");
  });

  it("差が無い（0）ときは符号を付けない", () => {
    expect(formatSignedDuration(0)).toBe("0:00");
  });
});

describe("formatLogicalDate（画面定義書01 §3.1）", () => {
  it("YYYY-MM-DD(曜) 形式にする", () => {
    expect(formatLogicalDate("2026-07-19", 0)).toBe("2026-07-19(日)");
  });

  it("曜日インデックスの上端（6=土）も正しく引く", () => {
    expect(formatLogicalDate("2026-07-25", 6)).toBe("2026-07-25(土)");
  });
});

describe("formatClock（画面定義書01 §3.3: 打刻時刻は日本時間 HH:MM）", () => {
  it("UTC を日本時間（+9h）へ変換してゼロ埋めする", () => {
    // 2026-07-20T00:05:00Z → JST 09:05
    expect(formatClock(new Date("2026-07-20T00:05:00Z"))).toBe("09:05");
  });

  it("JST 深夜0時は 00:00（24:00 ではない）", () => {
    // 2026-07-20T15:00:00Z → JST 翌 00:00
    expect(formatClock(new Date("2026-07-20T15:00:00Z"))).toBe("00:00");
  });
});

// `HH:MM` の解釈そのもの（区切りなし・範囲外・余剰・空文字・トリム）は `parseClockTime` が持ち、
// `domain/task/punch-edit.test.ts` が網羅する。ここで足しているのはゼロ埋めと `Result` → `null` の変換
describe("normalizeClockInput（画面定義書01 §3.3: 区切りなし入力の正規化）", () => {
  it("解釈できたらゼロ埋めして HH:MM を返す", () => {
    expect(normalizeClockInput("805")).toBe("08:05");
  });

  it("解釈できなければ null を返す（Result を潰す）", () => {
    expect(normalizeClockInput("24:00")).toBeNull();
  });
});
