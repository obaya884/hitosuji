// デイリーのサマリ行（画面定義書01 §3.1）の DOM 読み取り。ラベルと値が別 span に分かれて
// いるので、どのテストからも同じ読み方をするためここに集約する。
// 表（§3.3）の読み取りは `table-helpers.ts`、グループとマスタのフィクスチャは `factories.ts`。
import { screen } from "@testing-library/react";

/**
 * サマリの値をラベルで引く（`終了予定` / `現在` / `残作業`）。ラベルは値と同じ親に並ぶので、
 * 親のテキストからラベルを取り除いた残りが値になる
 */
export function summaryValueOf(label: string): string {
  const wrapper = screen.getByText(label).parentElement;
  if (wrapper === null) throw new Error(`サマリの「${label}」の値が見つかりません`);
  return (wrapper.textContent ?? "").replace(label, "").trim();
}
