import { describe, expect, it } from "vitest";
import { planDateMove } from "./date-move";

const TODAY = "2026-09-21";

describe("planDateMove（O-7: 行き先は表示日で決まる）", () => {
  it("今日を見ているなら翌日へ送る（F-107: 先送り）", () => {
    expect(planDateMove(TODAY, TODAY)).toEqual({ to: "2026-09-22", countsAsPostpone: true });
  });

  it("過去日を見ているなら今日へ引き寄せる（F-123）", () => {
    expect(planDateMove("2026-09-18", TODAY)).toEqual({ to: TODAY, countsAsPostpone: true });
  });

  it("未来日を見ているなら今日へ引き寄せる（F-123 / FB-98）", () => {
    expect(planDateMove("2026-09-25", TODAY)).toEqual({ to: TODAY, countsAsPostpone: false });
  });

  // 何日ぶん引きずっていても1回の移動（データモデル定義書 §3.5: 加算は日数ではなく回数）
  it("過去日からは何日離れていても今日へ1回で着き、加算も1回ぶん", () => {
    expect(planDateMove("2026-06-01", TODAY)).toEqual({ to: TODAY, countsAsPostpone: true });
  });

  // 月・年をまたぐ送り先は addDays に委ねる（暦の計算をここで持たない）
  it("月末の今日から送ると翌月1日になる", () => {
    expect(planDateMove("2026-09-30", "2026-09-30")).toEqual({
      to: "2026-10-01",
      countsAsPostpone: true,
    });
  });
});
