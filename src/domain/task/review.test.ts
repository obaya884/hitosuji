import { describe, expect, it } from "vitest";
import { atJst, NEXT_TEST_DATE, TEST_DATE } from "../shared/testing/clock";
import {
  estimateDiffMinutes,
  executionLog,
  postponedTasks,
  sharePercent,
  totalActualMinutes,
  totalActualMinutesBy,
} from "./review";
import { task } from "./testing/task";

describe("executionLog（画面定義書04 §3.3: 実行済みタスクを開始時刻順）", () => {
  it("未実行タスクを含めない", () => {
    const log = executionLog([
      task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") }),
      task({ id: 2 }),
    ]);
    expect(log.map((t) => t.id)).toEqual([1]);
  });

  it("実行中タスク（終了打刻なし）はログに出す", () => {
    const log = executionLog([task({ id: 1, startedAt: atJst("08:00") })]);
    expect(log.map((t) => t.id)).toEqual([1]);
  });

  it("sort_order ではなく開始時刻の昇順に並べる（時系列で読むため）", () => {
    const log = executionLog([
      task({ id: 1, sortOrder: 1000, startedAt: atJst("10:00"), endedAt: atJst("10:30") }),
      task({ id: 2, sortOrder: 2000, startedAt: atJst("07:00"), endedAt: atJst("07:30") }),
    ]);
    expect(log.map((t) => t.id)).toEqual([2, 1]);
  });
});

describe("postponedTasks（画面定義書04 §3.4: その日に生まれて持ち越されたタスク＋その日に残っている未実行タスク）", () => {
  it("その日に残っている未実行タスクを数え、打刻のあるタスクは1分でも手をつけていれば数えない", () => {
    const postponed = postponedTasks(TEST_DATE, [
      task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:00") }),
      task({ id: 2 }),
      task({ id: 3 }),
    ]);
    expect(postponed.map((t) => t.id)).toEqual([2, 3]);
  });

  it("その日に生まれて後日へ持ち越されたタスクは、持ち越し先で実行済みでも数える（①）", () => {
    const postponed = postponedTasks(TEST_DATE, [
      task({
        id: 1,
        taskDate: NEXT_TEST_DATE,
        initialTaskDate: TEST_DATE,
        startedAt: atJst("08:00", NEXT_TEST_DATE),
        endedAt: atJst("08:30", NEXT_TEST_DATE),
      }),
      task({ id: 2, taskDate: NEXT_TEST_DATE, initialTaskDate: TEST_DATE }),
    ]);
    expect(postponed.map((t) => t.id)).toEqual([1, 2]);
  });

  it("持ち越されたもの（①）を先に、その日に残っているもの（②）を後に並べる", () => {
    const postponed = postponedTasks(TEST_DATE, [
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, taskDate: NEXT_TEST_DATE, initialTaskDate: TEST_DATE, sortOrder: 5000 }),
    ]);
    expect(postponed.map((t) => t.id)).toEqual([2, 1]);
  });

  it("①②それぞれの中はリスト上の並び（sort_order）に従う", () => {
    const postponed = postponedTasks(TEST_DATE, [
      task({ id: 1, sortOrder: 3000 }),
      task({ id: 2, sortOrder: 1000 }),
      task({ id: 3, taskDate: NEXT_TEST_DATE, initialTaskDate: TEST_DATE, sortOrder: 4000 }),
      task({ id: 4, taskDate: NEXT_TEST_DATE, initialTaskDate: TEST_DATE, sortOrder: 2000 }),
    ]);
    expect(postponed.map((t) => t.id)).toEqual([4, 3, 2, 1]);
  });

  it("①が複数の持ち越し先にまたがるときは持ち越し先の日付順で、sort_order は日をまたいで比べない", () => {
    const postponed = postponedTasks(TEST_DATE, [
      // 遠い日に小さい sort_order、近い日に大きい sort_order を置く（値だけで並べると逆転する）
      task({ id: 1, taskDate: "2026-07-28", initialTaskDate: TEST_DATE, sortOrder: 1000 }),
      task({ id: 2, taskDate: NEXT_TEST_DATE, initialTaskDate: TEST_DATE, sortOrder: 5000 }),
      task({ id: 3, taskDate: NEXT_TEST_DATE, initialTaskDate: TEST_DATE, sortOrder: 3000 }),
    ]);
    expect(postponed.map((t) => t.id)).toEqual([3, 2, 1]);
  });

  it("他の日から引き寄せられてその日に残っている未実行タスクは②として数える（F-123）", () => {
    const postponed = postponedTasks(TEST_DATE, [
      task({ id: 1, taskDate: TEST_DATE, initialTaskDate: "2026-07-20" }),
    ]);
    expect(postponed.map((t) => t.id)).toEqual([1]);
  });

  it("その日に生まれたが前の日へ動いたタスク（未来日から今日へ引き寄せ）は数えない", () => {
    // 表示日 = 未来日。そこに積んだタスクを今日へ引き寄せると task_date < initial_task_date になる
    const postponed = postponedTasks(NEXT_TEST_DATE, [
      task({ id: 1, taskDate: TEST_DATE, initialTaskDate: NEXT_TEST_DATE }),
    ]);
    expect(postponed).toEqual([]);
  });

  it("その日と無関係なタスクが混ざっていても数えない", () => {
    const postponed = postponedTasks(TEST_DATE, [
      task({ id: 1, taskDate: NEXT_TEST_DATE }),
      task({ id: 2, taskDate: "2026-07-20" }),
    ]);
    expect(postponed).toEqual([]);
  });
});

describe("totalActualMinutes（画面定義書04 §3.2・§3.3）", () => {
  it("完了タスクの実績を合計する", () => {
    const total = totalActualMinutes([
      task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") }),
      task({ id: 2, startedAt: atJst("09:00"), endedAt: atJst("09:20") }),
    ]);
    expect(total).toBe(50);
  });

  it("実行中タスクは実績が確定していないため加算しない", () => {
    const total = totalActualMinutes([
      task({ id: 1, startedAt: atJst("08:00"), endedAt: atJst("08:30") }),
      task({ id: 2, startedAt: atJst("09:00") }),
    ]);
    expect(total).toBe(30);
  });
});

describe("estimateDiffMinutes（画面定義書04 §3.3: 差異＝実績−見積）", () => {
  it("超過を正、短縮を負で返す", () => {
    const over = task({ id: 1, estimateMinutes: 20, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    const under = task({ id: 2, estimateMinutes: 60, startedAt: atJst("09:00"), endedAt: atJst("09:30") });
    expect(estimateDiffMinutes(over)).toBe(10);
    expect(estimateDiffMinutes(under)).toBe(-30);
  });

  // ぴったりは 0 であって「差異なし（null）」ではない。表記を符号なしの `0:00` に分ける
  // 根拠がここなので、値の側で固定しておく（表記は review-board.test.tsx）
  it("実績が見積ぴったりなら 0 を返す（null にしない）", () => {
    const t = task({ id: 1, estimateMinutes: 30, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(estimateDiffMinutes(t)).toBe(0);
  });

  it("見積もり未設定なら差異を出さない", () => {
    const t = task({ id: 1, estimateMinutes: 0, startedAt: atJst("08:00"), endedAt: atJst("08:30") });
    expect(estimateDiffMinutes(t)).toBeNull();
  });

  it("実行中は実績が確定していないため差異を出さない", () => {
    const t = task({ id: 1, estimateMinutes: 20, startedAt: atJst("08:00") });
    expect(estimateDiffMinutes(t)).toBeNull();
  });
});

describe("totalActualMinutesBy（画面定義書04 §3.5: 軸別の実績集計）", () => {
  const tasks = [
    task({ id: 1, modeId: 10, startedAt: atJst("08:00"), endedAt: atJst("09:00") }),
    task({ id: 2, modeId: 20, startedAt: atJst("09:00"), endedAt: atJst("09:30") }),
    task({ id: 3, modeId: 10, startedAt: atJst("10:00"), endedAt: atJst("10:30") }),
    task({ id: 4, modeId: null, startedAt: atJst("11:00"), endedAt: atJst("13:00") }),
  ];

  it("同じ軸の実績を合計し、実績時間の降順に並べる", () => {
    const totals = totalActualMinutesBy(tasks.slice(0, 3), (t) => t.modeId);
    expect(totals).toEqual([
      { key: 10, minutes: 90 },
      { key: 20, minutes: 30 },
    ]);
  });

  it("未設定は実績が最大でも最後に置く", () => {
    const totals = totalActualMinutesBy(tasks, (t) => t.modeId);
    expect(totals.map((r) => r.key)).toEqual([10, 20, null]);
  });

  it("実績0分の軸は行にしない", () => {
    const totals = totalActualMinutesBy(
      [task({ id: 1, modeId: 10, startedAt: atJst("08:00"), endedAt: atJst("08:00") })],
      (t) => t.modeId
    );
    expect(totals).toEqual([]);
  });

  it("実行中タスクは集計に含めない", () => {
    const totals = totalActualMinutesBy(
      [task({ id: 1, modeId: 10, startedAt: atJst("08:00") })],
      (t) => t.modeId
    );
    expect(totals).toEqual([]);
  });
});

describe("sharePercent（画面定義書04 §3.5: 期間の実績合計に対する割合）", () => {
  it("整数%に丸める", () => {
    expect(sharePercent(50, 300)).toBe(17);
  });

  it("合計が0なら0%（0除算を避ける）", () => {
    expect(sharePercent(0, 0)).toBe(0);
  });
});
