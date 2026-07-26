import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { StaleRunningBanner } from "./stale-running-banner";

// 画面定義書01 §8「実行中タスクが前日以前に放置されている（F-209）」
describe("StaleRunningBanner（画面定義書01 §8 / F-209: 前日以前の実行中タスクを警告し該当日へ導く）", () => {
  it("タスク名と該当日（YYYY-MM-DD(曜)）・開始時刻を示す", () => {
    render(
      <StaleRunningBanner
        task={task({
          id: 1,
          name: "就寝",
          taskDate: "2026-07-25",
          startedAt: atJst("23:40", "2026-07-25"),
        })}
      />
    );

    expect(screen.queryByText("就寝")).not.toBeNull();
    // 2026-07-25 は土曜。日付表記は §3.1 の `YYYY-MM-DD(曜)` に揃える
    expect(screen.queryByText("2026-07-25(土) 23:40〜")).not.toBeNull();
  });

  it("該当日を開くリンクはそのタスクの task_date を指す（打刻時刻から導出しない）", () => {
    render(
      <StaleRunningBanner
        task={task({ id: 1, taskDate: "2026-07-25", startedAt: atJst("01:00", "2026-07-26") })}
      />
    );

    const link = screen.getByText("該当日を開く");
    expect(link.getAttribute("href")).toBe("/?date=2026-07-25");
  });

  it("開始時刻が無ければ時刻は出さない（日付だけを示す）", () => {
    render(<StaleRunningBanner task={task({ id: 1, taskDate: "2026-07-25" })} />);

    expect(screen.queryByText("2026-07-25(土)")).not.toBeNull();
  });
});
