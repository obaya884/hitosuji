// 表示日を指定する画面遷移の URL（画面定義書01 §3.1 / 04 §5）。ボタンもショートカットも
// ここを通る。表示日は画面ごとに独立なので、どの画面へ移るかは `basePath` で受け取る
import { addDays, type LogicalDate } from "@/domain/shared/logical-date";

/**
 * デイリー（S-01）の画面パス。**今日へ移るときはこれをそのまま使う**（`?date=` を付けない）
 * ——表示日の既定が今日なので、今日を名指しすると日界（F-116）をまたいだ瞬間に古い日付が残る
 */
export const DAILY_PATH = "/";

/** レビュー（S-04）の画面パス。今日へ移るときの扱いは `DAILY_PATH` と同じ */
export const REVIEW_PATH = "/review";

/** 表示日を指定した遷移先。`offsetDays` を渡すとその日数ぶんずらした日付にする */
export function dateHref(basePath: string, date: LogicalDate, offsetDays = 0): string {
  return `${basePath}?date=${addDays(date, offsetDays)}`;
}
