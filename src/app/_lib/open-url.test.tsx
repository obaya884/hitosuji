// `.ts` 対象だが `window.open` を呼ぶブラウザ API のラッパなので jsdom（コンポーネント段）で見る
// （テスト戦略定義書 §3: jsdom を要するテストは対象が `.ts` でも `.test.tsx`）
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEW_TAB_ARGS, spyOnWindowOpen } from "@/app/_testing/window-open";
import { openInNewTab } from "./open-url";

describe("openInNewTab（F-125 / 画面定義書01 O-18: 新しいタブで開く）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("window.open を新しいタブ・noopener で呼ぶ", () => {
    const open = spyOnWindowOpen();

    openInNewTab("https://example.com/doc");

    expect(open).toHaveBeenCalledWith("https://example.com/doc", ...NEW_TAB_ARGS);
  });

  it("null なら何もしない（URL の無いタスクの開始で呼び出し側が分岐しなくて済む）", () => {
    const open = spyOnWindowOpen();

    openInNewTab(null);

    expect(open).not.toHaveBeenCalled();
  });
});
