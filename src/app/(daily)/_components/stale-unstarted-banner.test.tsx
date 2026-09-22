import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StaleUnstartedBanner } from "./stale-unstarted-banner";

// 画面定義書01 §8「未実施タスクが前日以前に残っている（F-124）」
describe("StaleUnstartedBanner（画面定義書01 §8 / F-124: 前日以前の未実施タスクを日付ごとに示し該当日へ導く）", () => {
  const counts = [
    { taskDate: "2026-07-23", count: 3 },
    { taskDate: "2026-07-25", count: 1 },
  ];

  it("何が起きているかを告げる", () => {
    // **文言をリテラルで書く**——辞書（`_lib/notice-messages.ts`）を import すると、描画側が
    // 辞書を使わず古い文字列を直書きしたままでもテストが追随して通ってしまう（T-153）
    const { container } = render(<StaleUnstartedBanner counts={counts} />);

    expect(container.textContent).toContain("前日以前に未実施のタスクが残っています");
  });

  it("日付ごとの件数を渡された順（古い日から）に `·` で区切って並べ、日付は `YYYY-MM-DD(曜)` で示す", () => {
    const { container } = render(<StaleUnstartedBanner counts={counts} />);

    // 2026-07-23 は木曜、2026-07-25 は土曜。日付表記は §3.1 に揃える。
    // 全文で固定する——区切りの有無・位置は部分一致では検出できない
    expect(container.textContent).toBe(
      "前日以前に未実施のタスクが残っています: 2026-07-23(木) 3件·2026-07-25(土) 1件"
    );
  });

  it("1日ぶんだけなら区切りを出さない", () => {
    const { container } = render(<StaleUnstartedBanner counts={[counts[0]]} />);

    expect(container.textContent).toBe("前日以前に未実施のタスクが残っています: 2026-07-23(木) 3件");
  });

  it("各日付が該当日を開くリンクになっている（片付けはその日のリスト上で行う）", () => {
    render(<StaleUnstartedBanner counts={counts} />);

    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/?date=2026-07-23",
      "/?date=2026-07-25",
    ]);
  });

  it("バナー自身は操作を持たない（§8。一括操作は置かない）", () => {
    render(<StaleUnstartedBanner counts={counts} />);

    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
