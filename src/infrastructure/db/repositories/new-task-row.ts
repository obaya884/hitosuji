// これから生まれるタスク行に `initial_task_date` を付ける（F-122 / データモデル定義書 §3.5）。
// 「生成時に必ず `task_date` と同値」は契機を問わない不変条件なので、呼び出し側に選ばせず
// INSERT の直前で埋める。タスクを生む経路はタスク側（手動追加・複製・中断と割り込みの再開）と
// ルーチン側（展開）の2つのリポジトリに分かれるため、規則の実体はここに1つだけ置く
import type { LogicalDate } from "@/domain/shared/logical-date";

/**
 * **削除の取り消し（restore）には使わない**——あちらは新しく生むのではなく削除前の行を
 * 戻す操作なので、`initial_task_date` も元の値をそのまま書き戻す（データモデル定義書 §3.5）
 */
export function withInitialTaskDate<T extends { taskDate: LogicalDate }>(row: T) {
  return { ...row, initialTaskDate: row.taskDate };
}
