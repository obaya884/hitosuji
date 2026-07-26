// 取り消し（Undo。F-115 / 画面定義書01 O-8・O-13・O-15）の保留とその文言。
// 保留の寿命は Undo トーストそのもの（00_共通 §2.2）で、保持と破棄はコンポーネントが担う。
// ここに置くのは「何を保持するか（型）」と「どう伝えるか（文言）」の純粋な部分だけ（T-48）。
import type { Task } from "@/domain/task/task";
import type { CompletionSnapshot } from "@/usecases/task/punch-usecases";

/**
 * 取り消せる直前の操作。削除（O-8）は復元用に削除したタスクを、完了の取り消し（O-15）は
 * 完了へ戻すための4列のスナップショット（データモデル定義書 §4.7）を持つ。
 * `name` はトーストの文言用（削除済みタスクの名前は画面から引けないため保持する）。
 * delete 枝では `task.name` と重複するが、文言の組み立てから種類分岐を消すため共通で持つ
 */
export type UndoTarget = Readonly<
  { name: string } & (
    | { type: "delete"; task: Task }
    | { type: "uncomplete"; snapshot: CompletionSnapshot }
  )
>;

/**
 * 取り消しの保留（Undoトースト表示中の1件。画面定義書01 O-13）。削除と完了の取り消しで
 * **共通の1スロット**に持ち、後から来た操作が前の保留を置き換える。`seq` はトーストの再マウント用
 */
export type PendingUndo = UndoTarget & Readonly<{ seq: number }>;

/** 引数が `PendingUndo` ではなく `UndoTarget` なのは、文言がトーストの寿命管理（`seq`）に依らないため */
export function pendingUndoMessage(undo: UndoTarget): string {
  const phrase = undo.type === "delete" ? "削除しました" : "未実行に戻しました";
  return `「${undo.name}」を${phrase}`;
}
