import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest の globals を有効にしていないため Testing Library の自動 cleanup が登録されない。
// 明示的に呼ばないと描画結果が DOM に残り、次のテストの screen クエリが多重一致する
afterEach(cleanup);
