// マスタ管理3表に固有の操作（T-39）。3表は同じ編集作法（画面定義書03 §4 / 00_共通 §2.3）を
// 持つため、編集の入口をここへ寄せる（表ごとの固有条項は各テストに書く）。
// 画面をまたぐものは `src/app/_testing/` にある（期待値の組み立てとクラス判定＝`dom.ts` /
// 行の引き方＝`table.ts` / 操作＝`interactions.ts` / Server Action の保留＝`actions.ts`）。
import { screen, within } from "@testing-library/react";
import { clickWithoutServer } from "@/app/_testing/interactions";
import { rowOf } from "@/app/_testing/table";

/** 名前セル（ボタン）を押してインライン編集に入り、現れた入力欄を返す（開くだけでサーバへは届かない） */
export function startEditingCell(name: string): HTMLInputElement {
  clickWithoutServer(within(rowOf(name)).getByRole("button", { name }));
  return screen.getByDisplayValue<HTMLInputElement>(name);
}
