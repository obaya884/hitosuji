import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// vitest の globals を有効にしていないため Testing Library の自動 cleanup が登録されない。
// 明示的に呼ばないと描画結果が DOM に残り、次のテストの screen クエリが多重一致する。
//
// フェイクタイマーの解除もここで行う（各テストファイルには置かない）。vitest の afterEach は
// 登録の逆順＝ファイル側が setup 側より先に走るため、ファイル側で useRealTimers を呼ぶと
// 「保留中のタイマーを破棄してからアンマウント」の順になり、タイマー内で setState する
// コンポーネントで act 警告や取りこぼしが読みにくい形で出る
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
