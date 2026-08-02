// マスタ管理3表に固有の読み取りと操作（T-39）。3表は同じ行の形と編集作法（画面定義書03 §4 /
// 00_共通 §2.3）を持つため、行の引き方と編集の入口をここへ寄せる（表ごとの固有条項は各テストに書く）。
// 画面をまたぐものは `src/app/_testing/` にある（期待値の組み立てとクラス判定＝`dom.ts` /
// 操作＝`interactions.ts` / Server Action の保留＝`actions.ts`）。
import { screen, within } from "@testing-library/react";
import { clickWithoutServer } from "@/app/_testing/interactions";

/**
 * 文言からその行（`<tr>`）を取る。**素の文言で引く**のは、マスタ3表の行が
 * 名前セルをボタンにする有効行と、素のテキストで並ぶアーカイブ済み行の2種類あるため
 * （デイリーは名前セルが必ずボタンなので `(daily)/_testing/table-helpers.ts` の
 * `taskRow` が役割・ボタン名で引く）
 */
export function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest("tr");
  if (row === null) throw new Error(`「${text}」の行が見つかりません`);
  return row;
}

/** 名前セル（ボタン）を押してインライン編集に入り、現れた入力欄を返す（開くだけでサーバへは届かない） */
export function startEditingCell(name: string): HTMLInputElement {
  clickWithoutServer(within(rowOf(name)).getByRole("button", { name }));
  return screen.getByDisplayValue<HTMLInputElement>(name);
}
