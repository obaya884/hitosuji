// `window.open` の偽物（F-125 / 画面定義書01 O-18）。新しいタブを開く挙動を見るテストは
// **段を問わずこの1つを使う**（`stubGlobal` と `spyOn` の2流派に分かれないように）。
// jsdom の `window.open` は未実装で呼ぶと console.error を出すため、何もしない実装に差し替える。
// 後始末は `vi.restoreAllMocks()`（各テストファイルの afterEach か `registerBoardHooks`）が担う
import { vi } from "vitest";

export function spyOnWindowOpen() {
  return vi.spyOn(window, "open").mockImplementation(() => null);
}

/** `openInNewTab` が `window.open` に渡す第2・第3引数（新しいタブ・`noopener`） */
export const NEW_TAB_ARGS = ["_blank", "noopener,noreferrer"] as const;
