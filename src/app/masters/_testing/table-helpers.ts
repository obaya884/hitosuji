// マスタ管理3表に固有の操作ヘルパー（T-39）。3表は同じ編集作法（画面定義書03 §4 /
// 00_共通 §2.3）を持つため、編集の入口だけをここへ寄せる（表ごとの固有条項は各テストに書く）。
// 画面をまたぐものは `src/app/_testing/` にある（DOM の読み取り＝`dom.ts` / Server Action の
// 保留＝`actions.ts`）。
import { fireEvent, screen, within } from "@testing-library/react";
import { rowOf } from "@/app/_testing/dom";

/** 名前セル（ボタン）を押してインライン編集に入り、現れた入力欄を返す */
export function startEditingCell(name: string): HTMLInputElement {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name }));
  return screen.getByDisplayValue(name);
}
