import { UNSET_MARK, UNSET_TIME_MARK } from "@/app/_lib/unset";

/**
 * 属性の未設定を示す薄色の記号（画面定義書00_共通 §2.4）。空欄にすると
 * 「表示する余地がない」と読めてしまうため記号で示す。語彙は `_lib/unset.ts`
 */
export function UnsetMark() {
  return <span className="text-ink-faint">{UNSET_MARK}</span>;
}

/** 時間の値の未設定・未確定を示す薄色の記号（同 §2.4）。0分の値は `duration-value.tsx` 経由で来る */
export function UnsetTimeMark() {
  return <span className="text-ink-faint">{UNSET_TIME_MARK}</span>;
}
