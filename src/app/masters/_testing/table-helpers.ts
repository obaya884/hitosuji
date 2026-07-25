// マスタ管理3表のコンポーネントテストで共通に使う操作ヘルパー（T-39）。
// 3表は同じ編集作法（画面定義書03 §4 / 00_共通 §2.3）を持つため、行の取得・編集開始・
// 保留中の Server Action の作り方だけをここへ寄せる（表ごとの固有条項は各テストに書く）。
import { fireEvent, screen, within } from "@testing-library/react";
import type { ActionResult } from "../_lib/action-result";

/** セル内の文言からその行（`<tr>`）を取る。行を特定してから `within` で性質を主張するために使う */
export function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest("tr");
  if (row === null) throw new Error(`「${text}」の行が見つかりません`);
  return row;
}

/** 名前セル（ボタン）を押してインライン編集に入り、現れた入力欄を返す */
export function startEditingCell(name: string): HTMLInputElement {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name }));
  return screen.getByDisplayValue(name);
}

/** 解決の時点をテストが握る Server Action の偽物（本物と同じ `Promise<ActionResult>` を返す） */
export function deferredAction(): Readonly<{
  promise: Promise<ActionResult>;
  resolve: (result: ActionResult) => void;
}> {
  let resolve!: (result: ActionResult) => void;
  const promise = new Promise<ActionResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
