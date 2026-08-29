import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFlipUp } from "./use-flip-up";

// 反転の判定式そのものは純関数へ切り出してユニット段で検証している（`flip-up.test.ts` が
// 00_共通 §2.1 の3条件と同点の境界を網羅する）。jsdom はレイアウト計算をせず offsetHeight や
// getBoundingClientRect() が常に 0 を返すため、このファイルで作れるのは常に下向きの状態だけ。
// ここでは幾何に依存しない側——閉じているときのリセットと既定値——だけを固定する。
// **実測の配線（どの要素を測るか・いつ測るか）は `use-flip-up.browser.test.tsx` が持つ**（T-03）
describe("useFlipUp（画面定義書00_共通 §2.1: ポップオーバーは画面下部で切れないよう上向きへ反転する）", () => {
  it("既定は下向き（アンカーの直下に開く）", () => {
    const { result } = renderHook(() => useFlipUp<HTMLDivElement>());

    expect(result.current.positionClass).toBe("mt-1");
  });

  it("ref を付けないまま開いても下向きのまま（幾何が読めないときは反転しない）", () => {
    const { result } = renderHook(() => useFlipUp<HTMLDivElement>(true));

    expect(result.current.positionClass).toBe("mt-1");
  });

  it("open が false のときは下向きへリセットする（再オープン時に前回の向きが残らない）", () => {
    const { result, rerender } = renderHook(({ open }) => useFlipUp<HTMLDivElement>(open), {
      initialProps: { open: true },
    });

    rerender({ open: false });

    expect(result.current.positionClass).toBe("mt-1");
  });

  it("返す ref はパネルに付けるためのもので、初期値は null", () => {
    const { result } = renderHook(() => useFlipUp<HTMLDivElement>());

    expect(result.current.ref.current).toBeNull();
  });
});
