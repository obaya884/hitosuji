import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { hasClass } from "@/app/_testing/dom";
import { PendingIndicator } from "./pending-indicator";

// **出すかどうかの判定は持たない**（猶予は `useSlowPending`、置き場は各画面）。
// この部品が持つのは文言・見た目・読み上げの契約だけ
describe("PendingIndicator（画面定義書00_共通 §4.2: 確定を待つ操作の進行中の合図）", () => {
  it("「保存中」と出す", () => {
    render(<PendingIndicator />);

    expect(screen.getByRole("status").textContent).toBe("保存中");
  });

  // 合図は結果ではなく経過なので、トーストの濃い地色（`bg-ink` / `bg-danger`）は使わない
  it("結果の通知より弱い見た目にする", () => {
    render(<PendingIndicator />);
    const notice = screen.getByRole("status");

    expect(hasClass(notice, "bg-surface")).toBe(true);
    expect(hasClass(notice, "text-ink-muted")).toBe(true);
    expect(hasClass(notice, "bg-ink")).toBe(false);
    expect(hasClass(notice, "bg-danger")).toBe(false);
  });
});
