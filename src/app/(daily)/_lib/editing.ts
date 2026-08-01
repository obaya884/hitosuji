// インライン編集の対象セル（画面定義書00_共通 §2.3 / 01 O-5 / 01 §4.1）。編集状態は親（DailyBoard）が
// 単一の真実として持ち、リスト → 行へ配るだけなので、型はどの部品にも属さない `_lib` に置く。

export type EditField =
  | "name"
  | "estimate"
  | "startedAt"
  | "endedAt"
  | "mode"
  | "project"
  | "section"
  /** ルーチン化ポップオーバー（O-12 / §4.1） */
  | "routinize";

/** 編集中のセル。どのタスクのどの項目を編集しているかの組 */
export type EditingCell = Readonly<{ taskId: number; field: EditField }>;
