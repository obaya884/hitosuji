// 行の地色（画面定義書01 §3.3 / §5）。タスク行とコメント行が同じ規則を使うので、
// どちらか片方だけ更新されて食い違うことがないようここに1本化する
import { taskStatus } from "@/domain/task/status";
import type { Task } from "@/domain/task/task";

/**
 * 行の地色のクラス。選択行は選択の面色、ハイライト行（F-118）は淡黄。
 * **選択が勝つ**のと**完了行ではハイライトの地色を出さない**のは §3.3——
 * どちらの場合も⭐が印を担うので、地色は「いま操作している行」「まだ残っている本丸」に取っておく
 */
export function rowBackgroundClass(task: Task, isSelected: boolean): string {
  if (isSelected) return "bg-accent-weak";
  if (task.highlighted && taskStatus(task) !== "completed") return "bg-highlight";
  return "";
}
