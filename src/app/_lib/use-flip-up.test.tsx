import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFlipUp } from "./use-flip-up";

// 反転そのものの検証はブラウザテストの領域（jsdom はレイアウト計算をせず offsetHeight や
// getBoundingClientRect() が常に 0 を返すため、上向きに反転する条件を作れない）。
// ここでは幾何に依存しない側——閉じているときのリセットと既定値——だけを固定する
describe("useFlipUp（画面定義書01 §7: ポップオーバーは画面下部で切れないよう上向きへ反転する）", () => {
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
