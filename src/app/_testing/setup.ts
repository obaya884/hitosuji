import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { assertNoConsoleError, drainConsoleErrors, startConsoleErrorGuard } from "./console-guard";
import { pathname, router, UNSET_PATHNAME } from "./next-navigation";

// `next/navigation` は段の前提として差し替える（テスト戦略定義書 §2。理由と使い方は ./next-navigation.ts）
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname.value,
}));

// `console.error` はこの段では出ないことを前提にし、出たらテスト失敗にする
// （T-111。落とす範囲と逃げ道は ./console-guard.ts）
startConsoleErrorGuard();

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
//
// `console.error` の検査は**最後**に置く。`cleanup()`（アンマウント）や `useRealTimers()`
// （保留タイマーの破棄）が出す警告まで含めて拾うため。`cleanup()` が投げたときは検査せず
// 回収だけして元の例外を上げる（理由は ./console-guard.ts の `drainConsoleErrors`）
afterEach(() => {
  try {
    cleanup();
  } catch (error) {
    drainConsoleErrors();
    throw error;
  } finally {
    // アンマウントに失敗しても後始末は済ませる。残すとフェイクタイマーが次のテストへ漏れ、
    // 網が入った今は「無関係なテストの act 警告」という読みにくい形で出る
    vi.useRealTimers();
    vi.clearAllMocks();
    pathname.value = UNSET_PATHNAME; // `router` と違い箱なので `clearAllMocks` では戻らない
  }
  assertNoConsoleError();
});
