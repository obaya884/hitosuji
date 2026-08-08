import { formatDuration } from "@/app/_lib/format";
import { UnsetTimeMark } from "./unset-mark";

/**
 * 分を `H:MM` で出し、**0分は未設定**として薄色の `--:--` にする（画面定義書00_共通 §2.4）。
 * **実績には使わない**——実績の0分は確定値なので `0:00` と出す（01 §3.3）。
 * 整形関数ではなく部品なのは、記号に薄色が必ず付くことを呼び出し側に委ねないため
 */
export function DurationValue({ minutes }: Readonly<{ minutes: number }>) {
  return minutes <= 0 ? <UnsetTimeMark /> : <>{formatDuration(minutes)}</>;
}
