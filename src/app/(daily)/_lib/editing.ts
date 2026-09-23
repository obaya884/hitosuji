// インライン編集の対象セル（画面定義書00_共通 §2.3 / 画面定義書01 O-5・§4.1）。編集状態は親（DailyBoard）が
// 単一の真実として持ち、リスト → 行へ配るだけなので、型はどの部品にも属さない `_lib` に置く。
import type { Task, TaskId } from "@/domain/task/task";

export type EditField =
  | "name"
  | "estimate"
  | "startedAt"
  | "endedAt"
  | "mode"
  | "project"
  | "section"
  /** コメント（O-16 / F-206）。行の下に開く複数行の入力欄 */
  | "comment"
  /** 参照先 URL（O-18 / F-125）。行の下に開く1行の入力欄（編集中だけ。表示のための行は持たない） */
  | "url"
  /** ルーチン化ポップオーバー（O-12 / §4.1） */
  | "routinize";

/** 編集中のセル。どのタスクのどの項目を編集しているかの組 */
export type EditingCell = Readonly<{ taskId: TaskId; field: EditField }>;

/**
 * タスク行の下にコメントを開くか（画面定義書01 §3.3 / O-16）。
 * 編集中は常に、そうでなければ**選択行がコメントを持つとき**だけ開く。
 * コメント行を出すリストと、下線を譲るタスク行の両方が引くのでここに置く
 */
export function showsCommentRow(
  task: Task,
  isSelected: boolean,
  editing: EditField | null
): boolean {
  return editing === "comment" || (isSelected && task.comment !== null);
}

/**
 * タスク行の下に2行目（コメント行 O-16 か URL の入力行 O-18）が続くか。
 * 2段で1件のタスクなので、続くときはタスク行の下線をそちらへ譲る（`task-row.tsx`）。
 * URL の行は編集中だけ開く（表示のための行は持たない。画面定義書01 O-18）
 */
export function showsDetailRow(
  task: Task,
  isSelected: boolean,
  editing: EditField | null
): boolean {
  return editing === "url" || showsCommentRow(task, isSelected, editing);
}
