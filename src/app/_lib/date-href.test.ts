import { describe, expect, it } from "vitest";

import { dateHref } from "./date-href";

describe("dateHref（画面定義書01 §3.1 / 04 §5: 日付移動の遷移先）", () => {
  it("画面ごとの basePath に表示日のクエリを付ける（表示日は画面ごとに独立）", () => {
    expect(dateHref("/", "2026-08-02")).toBe("/?date=2026-08-02");
    expect(dateHref("/review", "2026-08-02")).toBe("/review?date=2026-08-02");
  });

  // 暦の加減算そのものは domain 段（`logical-date.test.ts` の `addDays`）が持つ。
  // ここで見るのは「渡した日数がそのまま `addDays` へ渡っているか」だけ
  it("日数を渡すとその日数ぶんずらす（前日 / 翌日）", () => {
    expect(dateHref("/", "2026-08-02", -1)).toBe("/?date=2026-08-01");
    expect(dateHref("/review", "2026-08-02", 1)).toBe("/review?date=2026-08-03");
  });
});
