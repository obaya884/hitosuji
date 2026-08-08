import { UNSET_MARK } from "@/app/_lib/unset";

/**
 * 属性の未設定を一覧のセルに示す薄色の記号（画面定義書00_共通 §2.4）。空欄にすると
 * 「表示する余地がない」と読めてしまうため、記号で不在を示す。
 * 語彙は `_lib/unset.ts` が持ち、ここは描き方だけを持つ
 */
export function UnsetMark() {
  return <span className="text-ink-faint">{UNSET_MARK}</span>;
}
