import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNow } from "./use-now";

// 画面定義書01 §3.3/§7: 経過時間はクライアントタイマーで更新し通信しない。
// 分の境界に合わせて刻むので、表示上の分が変わる瞬間に更新される
describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enabled のとき現在時刻を返す", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));

    const { result } = renderHook(() => useNow(true));

    expect(result.current).toEqual(new Date("2026-07-26T10:30:20.000Z"));
  });

  it("次の分の境界で更新される（20.000秒地点なら40秒後）", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));
    const { result } = renderHook(() => useNow(true));

    // 境界の直前では動かない
    act(() => {
      vi.advanceTimersByTime(39_999);
    });
    expect(result.current).toEqual(new Date("2026-07-26T10:30:20.000Z"));

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual(new Date("2026-07-26T10:31:00.000Z"));
  });

  it("境界をまたぐたびに刻み続ける", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));
    const { result } = renderHook(() => useNow(true));

    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toEqual(new Date("2026-07-26T10:32:00.000Z"));
  });

  it("enabled が false のときは更新しない", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));
    const { result } = renderHook(() => useNow(false));

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(result.current).toEqual(new Date("2026-07-26T10:30:20.000Z"));
  });

  it("アンマウントでタイマーを解放する", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));
    const { unmount } = renderHook(() => useNow(true));

    unmount();

    // 解放されていなければ setState が走り「アンマウント済みへの更新」警告が出る
    expect(vi.getTimerCount()).toBe(0);
  });
});
