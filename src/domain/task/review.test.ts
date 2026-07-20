import { describe, expect, it } from "vitest";
import {
  estimateDiffMinutes,
  executionLog,
  postponedTasks,
  sharePercent,
  totalActualMinutes,
  totalActualMinutesBy,
} from "./review";
import type { Task } from "./task";

function at(clock: string): Date {
  return new Date(`2026-07-19T${clock}:00+09:00`);
}

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 0,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: over.id * 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

describe("executionLog（画面定義書04 §3.3: 実行済みタスクを開始時刻順）", () => {
  it("未実行タスクを含めない", () => {
    const log = executionLog([
      task({ id: 1, startedAt: at("08:00"), endedAt: at("08:30") }),
      task({ id: 2 }),
    ]);
    expect(log.map((t) => t.id)).toEqual([1]);
  });

  it("実行中タスク（終了打刻なし）はログに出す", () => {
    const log = executionLog([task({ id: 1, startedAt: at("08:00") })]);
    expect(log.map((t) => t.id)).toEqual([1]);
  });

  it("sort_order ではなく開始時刻の昇順に並べる（時系列で読むため）", () => {
    const log = executionLog([
      task({ id: 1, sortOrder: 1000, startedAt: at("10:00"), endedAt: at("10:30") }),
      task({ id: 2, sortOrder: 2000, startedAt: at("07:00"), endedAt: at("07:30") }),
    ]);
    expect(log.map((t) => t.id)).toEqual([2, 1]);
  });
});

describe("postponedTasks（画面定義書04 §3.4: その日に残っている未実行タスク）", () => {
  it("打刻のあるタスクは1分でも手をつけていれば先送りに数えない", () => {
    const postponed = postponedTasks([
      task({ id: 1, startedAt: at("08:00"), endedAt: at("08:00") }),
      task({ id: 2 }),
      task({ id: 3 }),
    ]);
    expect(postponed.map((t) => t.id)).toEqual([2, 3]);
  });

  it("リスト上の並び（sort_order）のまま返す", () => {
    const postponed = postponedTasks([
      task({ id: 1, sortOrder: 3000 }),
      task({ id: 2, sortOrder: 1000 }),
    ]);
    expect(postponed.map((t) => t.id)).toEqual([2, 1]);
  });
});

describe("totalActualMinutes（画面定義書04 §3.2・§3.3）", () => {
  it("完了タスクの実績を合計する", () => {
    const total = totalActualMinutes([
      task({ id: 1, startedAt: at("08:00"), endedAt: at("08:30") }),
      task({ id: 2, startedAt: at("09:00"), endedAt: at("09:20") }),
    ]);
    expect(total).toBe(50);
  });

  it("実行中タスクは実績が確定していないため加算しない", () => {
    const total = totalActualMinutes([
      task({ id: 1, startedAt: at("08:00"), endedAt: at("08:30") }),
      task({ id: 2, startedAt: at("09:00") }),
    ]);
    expect(total).toBe(30);
  });
});

describe("estimateDiffMinutes（画面定義書04 §3.3: 差異＝実績−見積）", () => {
  it("超過を正、短縮を負で返す", () => {
    const over = task({ id: 1, estimateMinutes: 20, startedAt: at("08:00"), endedAt: at("08:30") });
    const under = task({ id: 2, estimateMinutes: 60, startedAt: at("09:00"), endedAt: at("09:30") });
    expect(estimateDiffMinutes(over)).toBe(10);
    expect(estimateDiffMinutes(under)).toBe(-30);
  });

  it("見積もり未設定なら差異を出さない", () => {
    const t = task({ id: 1, estimateMinutes: 0, startedAt: at("08:00"), endedAt: at("08:30") });
    expect(estimateDiffMinutes(t)).toBeNull();
  });

  it("実行中は実績が確定していないため差異を出さない", () => {
    const t = task({ id: 1, estimateMinutes: 20, startedAt: at("08:00") });
    expect(estimateDiffMinutes(t)).toBeNull();
  });
});

describe("totalActualMinutesBy（画面定義書04 §3.5: 軸別の実績集計）", () => {
  const tasks = [
    task({ id: 1, modeId: 10, startedAt: at("08:00"), endedAt: at("09:00") }),
    task({ id: 2, modeId: 20, startedAt: at("09:00"), endedAt: at("09:30") }),
    task({ id: 3, modeId: 10, startedAt: at("10:00"), endedAt: at("10:30") }),
    task({ id: 4, modeId: null, startedAt: at("11:00"), endedAt: at("13:00") }),
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
      [task({ id: 1, modeId: 10, startedAt: at("08:00"), endedAt: at("08:00") })],
      (t) => t.modeId
    );
    expect(totals).toEqual([]);
  });

  it("実行中タスクは集計に含めない", () => {
    const totals = totalActualMinutesBy(
      [task({ id: 1, modeId: 10, startedAt: at("08:00") })],
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
