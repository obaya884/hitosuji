// バンドル管理（S-05）に固有の読み取り（T-39 と同じ発想）。画面をまたぐものは
// `src/app/_testing/` にある（期待値の組み立てとクラス判定＝`dom.ts` / 操作＝`interactions.ts` /
// Server Action の保留＝`actions.ts`）。
import { screen } from "@testing-library/react";

/**
 * 文言からその行（`<tr>`）を取る（左ペインの一覧行・アーカイブ済み行のどちらにも使う）。
 * 右ペインのヘッダにも同じバンドル名が出るため、`<tr>` の中にある一致だけに絞る
 * （素の `getByText` だと選択中バンドルで重複してしまう）
 */
export function rowOf(text: string): HTMLElement {
  const row = screen.getAllByText(text).find((el) => el.closest("tr") !== null)?.closest("tr");
  if (row === null || row === undefined) throw new Error(`「${text}」の行が見つかりません`);
  return row;
}
