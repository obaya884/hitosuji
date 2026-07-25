import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DailyGroup } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";

import { DailySummary } from "./daily-summary";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-26",
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

function group(tasks: readonly Task[]): DailyGroup {
  return { section: null, endTime: null, tasks };
}

/** 終了予定・残作業はラベルと値が別 span なので、ラベルの親から値を読む */
function valueOf(label: string): string {
  const labelEl = screen.getByText(label);
  const wrapper = labelEl.parentElement as HTMLElement;
  return (wrapper.textContent ?? "").replace(label, "").trim();
}

// 値の式は domain の projection.test.ts が担保済み。ここは「何をいつ出すか」（§3.1）に絞る
describe("DailySummary（画面定義書01 §3.1 / F-104・F-114: 終了予定・現在・残作業と1日全体の進捗）", () => {
  it("当日表示では終了予定・現在・残作業を並べる", () => {
    // ローカル時刻で組む（終了予定の折返しは論理日の暦日 0:00 起点で測るため）
    const now = new Date(2026, 6, 26, 10, 0);
    render(
      <DailySummary
        groups={[group([task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 45 })])]}
        now={now}
        isToday
        dayStartMinutes={0}
      />
    );

    // 残作業 = 未完了見積もりの合計（30 + 45）
    expect(valueOf("残作業")).toBe("1:15");
    // 終了予定 = 現在 + 残作業
    expect(valueOf("終了予定")).toBe("11:15");
  });

  it("現在時刻は日本時間の HH:MM で出す", () => {
    render(
      <DailySummary
        groups={[group([])]}
        now={new Date("2026-07-26T16:15:00+09:00")}
        isToday
        dayStartMinutes={0}
      />
    );

    expect(valueOf("現在")).toBe("16:15");
  });

  it("当日以外は終了予定・現在・残作業を出さない（現在時刻起点の値は別の日に意味を持たない）", () => {
    render(
      <DailySummary
        groups={[group([task({ id: 1, estimateMinutes: 30 })])]}
        now={new Date(2026, 6, 26, 10, 0)}
        isToday={false}
        dayStartMinutes={0}
      />
    );

    expect(screen.queryByText("終了予定")).toBeNull();
    expect(screen.queryByText("現在")).toBeNull();
    expect(screen.queryByText("残作業")).toBeNull();
  });

  it("1日全体の進捗は表示日によらず出す（過去日の振り返りでも見る。F-114）", () => {
    const done = task({
      id: 1,
      startedAt: new Date("2026-07-26T09:00:00+09:00"),
      endedAt: new Date("2026-07-26T09:30:00+09:00"),
    });
    render(
      <DailySummary
        groups={[group([done, task({ id: 2 })])]}
        now={new Date(2026, 6, 26, 10, 0)}
        isToday={false}
        dayStartMinutes={0}
      />
    );

    expect(screen.queryByText("1/2")).not.toBeNull();
  });

  it("複数セクションのタスクを1日ぶんとして合算する", () => {
    render(
      <DailySummary
        groups={[
          group([task({ id: 1, estimateMinutes: 30 })]),
          group([task({ id: 2, estimateMinutes: 15 })]),
        ]}
        now={new Date(2026, 6, 26, 10, 0)}
        isToday
        dayStartMinutes={0}
      />
    );

    expect(valueOf("残作業")).toBe("0:45");
  });

  it("日界を越える終了予定は折返し表記（25:30 形式）で警告色にする（F-104）", () => {
    const now = new Date(2026, 6, 26, 23, 0);
    render(
      <DailySummary
        groups={[group([task({ id: 1, estimateMinutes: 150 })])]}
        now={now}
        isToday
        dayStartMinutes={0}
      />
    );

    const value = screen.getByText("25:30");
    expect(value.classList.contains("text-danger")).toBe(true);
  });

  it("日界内に収まる終了予定は警告色にしない", () => {
    render(
      <DailySummary
        groups={[group([task({ id: 1, estimateMinutes: 30 })])]}
        now={new Date(2026, 6, 26, 23, 0)}
        isToday
        dayStartMinutes={0}
      />
    );

    const value = screen.getByText("23:30");
    expect(value.classList.contains("text-danger")).toBe(false);
  });
});
