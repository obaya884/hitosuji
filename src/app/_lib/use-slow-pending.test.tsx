import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SLOW_PENDING_DELAY_MS, useSlowPending } from "./use-slow-pending";

// 猶予の測定に使う setTimeout をテストが握る。解除は `setup.ts` が持つ（各ファイルには置かない）

/** 猶予ぶんの時間を進め、タイマーで起きた再描画まで流す */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useSlowPending（画面定義書00_共通 §4.2: 確定を待つ操作が猶予を超えたときだけ合図を出す）", () => {
  // 猶予は 0.5秒（§4.2）。**リテラルで固定する**——定数を参照して時間を進めると、
  // 値を縮める変更が全テスト緑のまま通り、条項が守られなくなる（`toast.test.tsx` と同じ流儀）
  it("応答待ちが 0.5秒 を超えたら立つ", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSlowPending(true));
    expect(result.current).toBe(false);

    await advance(500);

    expect(result.current).toBe(true);
  });

  // 速い操作に合図を出すと数十msの点滅にしかならない（この遅延が条項の要点）
  it("0.5秒 の直前までは立たない", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSlowPending(true));

    await advance(499);

    expect(result.current).toBe(false);
  });

  it("応答が届いたら下りる", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook((pending: boolean) => useSlowPending(pending), {
      initialProps: true,
    });
    await advance(SLOW_PENDING_DELAY_MS);
    expect(result.current).toBe(true);

    rerender(false);

    expect(result.current).toBe(false);
  });

  // 猶予は操作ごとに測り直す。持ち越すと2回目の速い操作で即座に光る
  it("前の操作で超えた猶予を次の操作へ持ち越さない", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook((pending: boolean) => useSlowPending(pending), {
      initialProps: true,
    });
    await advance(SLOW_PENDING_DELAY_MS);

    rerender(false);
    rerender(true);

    expect(result.current).toBe(false);
    await advance(SLOW_PENDING_DELAY_MS - 1);
    expect(result.current).toBe(false);
  });

  it("応答待ちでないあいだは、いくら時間が経っても立たない", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSlowPending(false));

    await advance(SLOW_PENDING_DELAY_MS * 4);

    expect(result.current).toBe(false);
  });

  // 外したあとにタイマーが起きると、消えた画面に対して状態を書きに行くことになる
  it("外すときにタイマーを残さない", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSlowPending(true));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
