import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNow } from "./use-now";

describe("useNow（画面定義書01 §3.3/§7: 経過時間はクライアントタイマーで毎分更新し通信しない）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

  it("分の境界そのものでマウントしたら次の刻みは60秒後（60_000 - 0 の端）", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:00.000Z"));
    const { result } = renderHook(() => useNow(true));

    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(result.current).toEqual(new Date("2026-07-26T10:30:00.000Z"));

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual(new Date("2026-07-26T10:31:00.000Z"));
  });

  it("enabled が false のときは更新しない", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));
    const { result } = renderHook(() => useNow(false));

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(result.current).toEqual(new Date("2026-07-26T10:30:20.000Z"));
  });

  // daily-board は useNow(hasRunning || isToday) で呼ぶため、開始打刻の瞬間に
  // enabled が false → true へ変わる。停止中に古くなった now へ即追いつく必要がある
  it("false → true に切り替わったら即座に最新時刻へ追いつく", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));
    const { result, rerender } = renderHook(({ enabled }) => useNow(enabled), {
      initialProps: { enabled: false },
    });

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current).toEqual(new Date("2026-07-26T10:30:20.000Z"));

    act(() => {
      rerender({ enabled: true });
    });

    expect(result.current).toEqual(new Date("2026-07-26T10:32:20.000Z"));
  });

  it("true → false に戻すと以後は進まない（購読解除）", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));
    const { result, rerender } = renderHook(({ enabled }) => useNow(enabled), {
      initialProps: { enabled: true },
    });

    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(result.current).toEqual(new Date("2026-07-26T10:31:00.000Z"));

    act(() => {
      rerender({ enabled: false });
    });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(result.current).toEqual(new Date("2026-07-26T10:31:00.000Z"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("アンマウントでタイマーを解放する", () => {
    vi.setSystemTime(new Date("2026-07-26T10:30:20.000Z"));
    const { unmount } = renderHook(() => useNow(true));

    unmount();

    // 解放されていなければ setState が走り「アンマウント済みへの更新」警告が出る
    expect(vi.getTimerCount()).toBe(0);
  });
});
