import { pendingNotice } from "@/app/_lib/ui";

/**
 * 確定を待つ操作の進行中の合図（画面定義書00_共通 §4.2）。
 * **出すかどうかの判定（猶予を超えたか）は呼び出し側が持つ**（`useSlowPending`）——
 * 置き場が画面ごとに違う（デイリーはトーストと同じ列、管理画面は単独）ため、
 * この部品は文言と見た目だけを担う。
 *
 * `role="status"` は読み上げ用。割り込みの強い `alert` にしないのは、これが結果ではなく
 * 経過の通知で、読み上げ中の内容を止めてまで伝えるものではないため
 */
export function PendingIndicator() {
  return (
    <p role="status" className={pendingNotice}>
      保存中
    </p>
  );
}
