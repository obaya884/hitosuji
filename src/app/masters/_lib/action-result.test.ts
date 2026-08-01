import { describe, expect, it } from "vitest";

import { MASTER_MESSAGES, type MasterError } from "@/app/_lib/error-messages";
import { failure } from "./action-result";

/**
 * `failure` はエラーコードを共通辞書の文言つき失敗へ包むだけの入口（画面定義書03 §3.1・§3.2・§4.1）。
 * 文言そのものの対応表は辞書の隣（`_lib/error-messages.test.ts`）が固定するので、
 * ここでは**どのコードも取りこぼさずに辞書を引く**ことだけを全コード走査で確かめる（T-78）
 */
describe("failure（マスタ管理: エラーコードを表示用メッセージつきの失敗へ包む）", () => {
  it("どのコードでもマスタ管理の辞書を引き、ok:false で包む", () => {
    const codes = Object.keys(MASTER_MESSAGES) as MasterError[];

    expect(codes.length).toBeGreaterThan(0); // 走査が空振りしていないこと
    for (const code of codes) {
      expect(failure(code)).toEqual({ ok: false, message: MASTER_MESSAGES[code] });
    }
  });
});
