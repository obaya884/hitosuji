import { describe, expect, it } from "vitest";
import { validateName } from "./master-name";

describe("validateName（画面定義書03 §3: 名前はテキスト・50文字以内）", () => {
  it("前後の空白を除去して返す", () => {
    expect(validateName("  仕事 ")).toEqual({ ok: true, value: "仕事" });
  });

  it("空白のみはエラー", () => {
    expect(validateName(" ")).toEqual({ ok: false, error: "name_required" });
  });

  it("50文字ちょうどは許容し、51文字はエラー", () => {
    expect(validateName("あ".repeat(50)).ok).toBe(true);
    expect(validateName("あ".repeat(51))).toEqual({ ok: false, error: "name_too_long" });
  });

  it("空白を除いて50文字以内なら許容する", () => {
    expect(validateName(` ${"あ".repeat(50)} `).ok).toBe(true);
  });
});
