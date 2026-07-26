import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { pathname, router, UNSET_PATHNAME } from "./next-navigation";

// `next/navigation` は段の前提として差し替える（§8。理由と使い方は ./next-navigation.ts）
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname.value,
}));

// vitest の globals を有効にしていないため Testing Library の自動 cleanup が登録されない。
// 明示的に呼ばないと描画結果が DOM に残り、次のテストの screen クエリが多重一致する。
//
// フェイクタイマーの解除もここで行う（各テストファイルには置かない）。vitest の afterEach は
// 登録の逆順＝ファイル側が setup 側より先に走るため、ファイル側で useRealTimers を呼ぶと
// 「保留中のタイマーを破棄してからアンマウント」の順になり、タイマー内で setState する
// コンポーネントで act 警告や取りこぼしが読みにくい形で出る
//
// `clearAllMocks` は**呼び出し記録だけ**を消す（実装は残る）ので、`mockReturnValue` 等で
// 組んだ既定は生き残る。これも各ファイルの `beforeEach` に散らさずここで一括して行う
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  pathname.value = UNSET_PATHNAME; // `router` と違い箱なので `clearAllMocks` では戻らない
});
