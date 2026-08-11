// 画面をまたぐ表の読み取り（テスト戦略定義書 §4）。マスタ管理3表・バンドル管理・共通部品
// （`ArchivedSection`）は同じ行の形（文言のセル＋操作ボタン）を持つので、行の引き方を
// ここに1本だけ置く。**デイリーの表は行の形が違う**ので `(daily)/_testing/table-helpers.ts`
// の `taskRow` が別に持つ（名前セルが必ずボタンで、役割で引ける）
import { screen } from "@testing-library/react";

/**
 * 文言からその行（`<tr>`）を取る。**素の文言で引く**——これらの表は名前セルがボタンの有効行と、
 * 素のテキストで並ぶアーカイブ済み行の2種類を持つため。
 * 同じ文言が表の外（バンドル管理の右ペインのヘッダ）にも出るので `<tr>` の中の一致だけに絞り、
 * **絞ってなお複数あれば落とす**（取り違えた行に対する assert は静かに通ってしまう）
 */
export function rowOf(text: string): HTMLElement {
  const rows = screen.getAllByText(text).flatMap((el) => {
    const row = el.closest("tr");
    return row === null ? [] : [row];
  });
  if (rows.length === 0) throw new Error(`「${text}」の行が見つかりません`);
  if (rows.length > 1) throw new Error(`「${text}」の行が複数あります（${rows.length}件）`);
  return rows[0];
}
