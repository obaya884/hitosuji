// 日付移動（画面定義書01 O-7 / F-107・F-123）。行き先を表示日から決める規則
import { addDays, type LogicalDate } from "../shared/logical-date";

export type DateMove = Readonly<{
  to: LogicalDate;
  /** postponed_count を加算するか。行き先が元の日より後のときだけ true（データモデル定義書 §3.5） */
  countsAsPostpone: boolean;
}>;

/**
 * 移動先と加算可否を決める。**今日を見ているなら翌日へ送り（先送り F-107）、
 * そうでなければ今日へ引き寄せる**（F-123）——過去日からは後ろへ、未来日からは前へ動く。
 * 加算を操作名ではなく向きで決める理由はデータモデル定義書 §3.5（経緯は log_14 2026-09-21）。
 *
 * **`taskDate` が表示日にあたる**のは、対象が表示日のリストに並ぶ行だから。前日から残った
 * 実行中タスクだけは今日の盤面に出るが、この操作は未実行に限るので届かない（画面定義書01 O-7）
 */
export function planDateMove(taskDate: LogicalDate, today: LogicalDate): DateMove {
  const to = taskDate === today ? addDays(today, 1) : today;
  return { to, countsAsPostpone: to > taskDate };
}
