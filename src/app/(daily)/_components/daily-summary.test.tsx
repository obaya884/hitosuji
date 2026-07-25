import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { at, task, unclassifiedGroup } from "../_testing/factories";
import { DailySummary } from "./daily-summary";

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
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 45 })])]}
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
        groups={[unclassifiedGroup([])]}
        now={at("16:15")}
        isToday
        dayStartMinutes={0}
      />
    );

    expect(valueOf("現在")).toBe("16:15");
  });

  it("当日以外は終了予定・現在・残作業を出さない（現在時刻起点の値は別の日に意味を持たない）", () => {
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 30 })])]}
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
      startedAt: at("09:00"),
      endedAt: at("09:30"),
    });
    render(
      <DailySummary
        groups={[unclassifiedGroup([done, task({ id: 2 })])]}
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
          unclassifiedGroup([task({ id: 1, estimateMinutes: 30 })]),
          unclassifiedGroup([task({ id: 2, estimateMinutes: 15 })]),
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
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 150 })])]}
        now={now}
        isToday
        dayStartMinutes={0}
      />
    );

    const value = screen.queryByText("25:30");
    expect(value).not.toBeNull();
    expect(value?.classList.contains("text-danger")).toBe(true);
  });

  it("日界内に収まる終了予定は警告色にしない", () => {
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 30 })])]}
        now={new Date(2026, 6, 26, 23, 0)}
        isToday
        dayStartMinutes={0}
      />
    );

    const value = screen.queryByText("23:30");
    expect(value).not.toBeNull();
    expect(value?.classList.contains("text-danger")).toBe(false);
  });

  it("日界（F-116）を起点に折返しと超過を測る（深夜は前の論理日の続き）", () => {
    // 日界 06:00・深夜 02:00 → 論理日は前の暦日（07-26）なので通算 27:00 と読む
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 60 })])]}
        now={new Date(2026, 6, 27, 2, 0)}
        isToday
        dayStartMinutes={360}
      />
    );

    const value = screen.queryByText("27:00");
    expect(value).not.toBeNull();
    // 次の日界（07-27 06:00）は越えないので警告色にしない
    expect(value?.classList.contains("text-danger")).toBe(false);
  });
});
