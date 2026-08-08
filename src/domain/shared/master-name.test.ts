import { describe, expect, it } from "vitest";
import { validateName } from "./master-name";

describe("validateName（画面定義書03 §4「名前の入力」: 空・空白のみは不可、文字数の上限なし）", () => {
  it("前後の空白を除去して返す", () => {
    expect(validateName("  仕事 ")).toEqual({ ok: true, value: "仕事" });
  });

  it("空文字・空白のみはエラー", () => {
    expect(validateName("")).toEqual({ ok: false, error: "name_required" });
    expect(validateName(" ")).toEqual({ ok: false, error: "name_required" });
  });

  // 上限を再び入れたらここで落ちる（FB-71 で撤廃した。50文字に根拠が無かった）
  it("文字数の上限は設けない（長い名前もそのまま通る）", () => {
    const long = "あ".repeat(500);
    expect(validateName(long)).toEqual({ ok: true, value: long });
  });
});
