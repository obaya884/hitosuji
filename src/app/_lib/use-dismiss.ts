import { useEffect, type RefObject } from "react";

/**
 * ポップオーバー等を「外側クリック＋Escape」で閉じる共通フック（画面定義書 00_共通 §7 / §3）。
 *
 * - `ref` を渡すと、その要素の外側での `mousedown` で `onClose` を呼ぶ。`null` を渡すと外側クリックは
 *   監視しない（スクリムの `onClick` で外側を扱う場合など）
 * - `escape`（既定 true）が true の間は Escape キーでも `onClose`。Escape を呼び出し側の別処理と
 *   融合させている場合（IME 判定込みのキーナビ等）は `escape: false` で外側クリックだけに絞る
 * - `enabled`（既定 true）が false の間は何も購読しない（常時マウントで `open` state を持つ呼び出し用）
 */
export function useDismiss<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null> | null,
  onClose: () => void,
  options: Readonly<{ enabled?: boolean; escape?: boolean }> = {}
): void {
  const enabled = options.enabled ?? true;
  const escape = options.escape ?? true;

  useEffect(() => {
    if (!enabled) return;

    function onMouseDown(e: MouseEvent) {
      const el = ref?.current ?? null;
      if (el !== null && !el.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    if (ref !== null) document.addEventListener("mousedown", onMouseDown);
    if (escape) document.addEventListener("keydown", onKeyDown);
    return () => {
      if (ref !== null) document.removeEventListener("mousedown", onMouseDown);
      if (escape) document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, onClose, enabled, escape]);
}
