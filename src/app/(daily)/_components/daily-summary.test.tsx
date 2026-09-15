import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Section } from "@/domain/section/section";

import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { sectionGroup, unclassifiedGroup } from "../_testing/factories";
import { summaryValueOf } from "../_testing/summary-helpers";
import { DailySummary } from "./daily-summary";

const MORNING: Section = {
  id: 100,
  name: "朝",
  startTime: "06:00",
  isArchived: false,
  isDayStart: true,
};

// 値の式は domain の projection.test.ts が担保済み。ここは「何をいつ出すか」（§3.1）に絞る。
// 日界の起点計算も値の式なので同様で、この画面が `dayStartMinutes` を渡しているかは
// `daily-board.display.test.tsx` の配線テストが見る
describe("DailySummary（画面定義書01 §3.1 / F-104・F-114: 終了予定・現在・残作業と1日全体の進捗）", () => {
  it("当日表示では終了予定・現在・残作業を並べる", () => {
    // 終了予定の日またぎは論理日の暦日 0:00 起点で測る（起点は JST。T-47）
    const now = atJst("10:00");
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 45 })])]}
        now={now}
        isToday
        dayStartMinutes={0}
      />
    );

    // 残作業 = 未完了見積もりの合計（30 + 45）
    expect(summaryValueOf("残作業")).toBe("1:15");
    // 終了予定 = 現在 + 残作業
    expect(summaryValueOf("終了予定")).toBe("11:15");
  });

  it("現在時刻は日本時間の HH:MM で出す", () => {
    render(
      <DailySummary
        groups={[unclassifiedGroup([])]}
        now={atJst("16:15")}
        isToday
        dayStartMinutes={0}
      />
    );

    expect(summaryValueOf("現在")).toBe("16:15");
  });

  it("当日以外は終了予定・現在・残作業を出さない（現在時刻起点の値は別の日に意味を持たない）", () => {
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 30 })])]}
        now={atJst("10:00")}
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
      startedAt: atJst("09:00"),
      endedAt: atJst("09:30"),
    });
    render(
      <DailySummary
        groups={[unclassifiedGroup([done, task({ id: 2 })])]}
        now={atJst("10:00")}
        isToday={false}
        dayStartMinutes={0}
      />
    );

    expect(screen.queryByText("1/2")).not.toBeNull();
  });

  it("未分類とセクションをまたいで1日ぶんとして合算する", () => {
    render(
      <DailySummary
        groups={[
          // 未分類はリストに1つだけ。またぐ相手はセクションのグループにする
          unclassifiedGroup([task({ id: 1, estimateMinutes: 30 })]),
          sectionGroup(MORNING, "09:00", [task({ id: 2, estimateMinutes: 15 })]),
        ]}
        now={atJst("10:00")}
        isToday
        dayStartMinutes={0}
      />
    );

    expect(summaryValueOf("残作業")).toBe("0:45");
  });

  it("日界を越える終了予定は「翌」を前置して警告色にする（F-104 / §3.1）", () => {
    const now = atJst("23:00");
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 150 })])]}
        now={now}
        isToday
        dayStartMinutes={0}
      />
    );

    const value = screen.queryByText("翌 1:30");
    expect(value).not.toBeNull();
    expect(value?.classList.contains("text-danger")).toBe(true);
  });

  // 警告色の側も日界を見る。上の2件は `dayStartMinutes={0}` なので、日界の引数を 0 に固定する
  // 変異を通してしまう——**非ゼロの日界でだけ判定が変わる入力**をここで置く
  it("警告色の判定も日界を起点にする（日界 06:00 なら翌 05:00 はまだ越えていない。F-116）", () => {
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 360 })])]}
        now={atJst("23:00")}
        isToday
        dayStartMinutes={360}
      />
    );

    // 翌 05:00 は次の日界（翌 06:00）の手前。日界を 0 とみなすと暦日をまたいだ時点で警告色になる
    const value = screen.queryByText("翌 5:00");
    expect(value).not.toBeNull();
    expect(value?.classList.contains("text-danger")).toBe(false);
  });

  it("日界内に収まる終了予定は警告色にしない", () => {
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, estimateMinutes: 30 })])]}
        now={atJst("23:00")}
        isToday
        dayStartMinutes={0}
      />
    );

    const value = screen.queryByText("23:30");
    expect(value).not.toBeNull();
    expect(value?.classList.contains("text-danger")).toBe(false);
  });

  it("進捗の件数は主段で出す（00_共通 §1.1。セクション見出しの既定＝メタに落ちない）", () => {
    render(
      <DailySummary
        groups={[unclassifiedGroup([task({ id: 1, startedAt: atJst("09:00"), endedAt: atJst("09:30") })])]}
        now={atJst("10:00")}
        isToday
        dayStartMinutes={0}
      />
    );

    // TaskProgress の既定はメタ（text-meta）なので、サマリ側が主段を渡していないと落ちる
    const progress = screen.getByText("1/1");
    expect(progress.classList.contains("text-main")).toBe(true);
    expect(progress.classList.contains("text-meta")).toBe(false);
  });
});
