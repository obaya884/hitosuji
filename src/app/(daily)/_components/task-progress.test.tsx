import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Task } from "@/domain/task/task";

import { TaskProgress } from "./task-progress";

// F-114 タスク消化の進捗。実施済み件数/全件数とバーの幅（画面定義書01 §3.1・§3.2）
describe("TaskProgress", () => {
  /** 進捗は打刻から導出される（ended_at があれば完了）ので、判定に必要な列だけ与える */
  const task = (id: number, endedAt: Date | null): Task =>
    ({ id, startedAt: endedAt === null ? null : new Date(), endedAt }) as Task;

  const barWidth = () => {
    // バーは装飾なので aria-hidden。style から実効値を読む
    const bar = document.querySelector<HTMLElement>(".bg-accent");
    return bar?.style.width ?? null;
  };

  it("実施済み件数/全件数を表示する", () => {
    render(<TaskProgress tasks={[task(1, new Date()), task(2, null), task(3, null)]} />);

    expect(screen.getByText("1/3")).toBeDefined();
  });

  it("完了件数に応じてバーの幅が変わる", () => {
    render(<TaskProgress tasks={[task(1, new Date()), task(2, new Date()), task(3, null)]} />);

    expect(barWidth()).toBe("66.66666666666666%");
  });

  it("全件完了なら 100%", () => {
    render(<TaskProgress tasks={[task(1, new Date()), task(2, new Date())]} />);

    expect(screen.getByText("2/2")).toBeDefined();
    expect(barWidth()).toBe("100%");
  });

  it("0件ならバーの幅は 0（ゼロ除算で NaN にならない）", () => {
    render(<TaskProgress tasks={[]} />);

    expect(screen.getByText("0/0")).toBeDefined();
    expect(barWidth()).toBe("0px");
  });

  it("バーの幅と文字サイズは呼び出し側が差し替えられる（§3.1 と §3.2 で使い分ける）", () => {
    render(<TaskProgress tasks={[task(1, null)]} barWidth="w-40" textSize="text-sm" />);

    expect(document.querySelector(".w-40")).not.toBeNull();
    expect(screen.getByText("0/1").className).toContain("text-sm");
  });
});
