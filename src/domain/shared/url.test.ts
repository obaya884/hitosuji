import { describe, expect, it } from "vitest";
import { validateUrl } from "./url";

describe("validateUrl（データモデル定義書 §3.5: http(s) で始まる1件・空は未設定へ）", () => {
  it("http:// / https:// で始まる文字列を前後の空白を落として受け付ける", () => {
    expect(validateUrl("https://example.com/docs ")).toEqual({
      ok: true,
      value: "https://example.com/docs",
    });
    expect(validateUrl("http://localhost:3000/")).toEqual({
      ok: true,
      value: "http://localhost:3000/",
    });
  });

  it("空・空白のみは null（URL を消す。不正ではない）", () => {
    expect(validateUrl("")).toEqual({ ok: true, value: null });
    expect(validateUrl("　")).toEqual({ ok: true, value: null });
  });

  it("http(s) 以外のスキーム・スキーム無しはエラー（javascript: 等を許可リストで弾く）", () => {
    expect(validateUrl("javascript:alert(1)")).toEqual({ ok: false, error: "invalid_url" });
    expect(validateUrl("example.com")).toEqual({ ok: false, error: "invalid_url" });
    expect(validateUrl("ftp://example.com")).toEqual({ ok: false, error: "invalid_url" });
    expect(validateUrl("https:/example.com")).toEqual({ ok: false, error: "invalid_url" });
    // 先頭で判定する（途中に http:// を含むだけでは通らない）
    expect(validateUrl("javascript:alert('https://x')")).toEqual({
      ok: false,
      error: "invalid_url",
    });
  });

  it("スキームは大文字でも受け付ける（ブラウザは大小を区別しない）", () => {
    expect(validateUrl("HTTPS://example.com")).toEqual({
      ok: true,
      value: "HTTPS://example.com",
    });
  });

  it("長さで切り詰めない（上限を設けない）", () => {
    const long = `https://example.com/${"a".repeat(5000)}`;
    expect(validateUrl(long)).toEqual({ ok: true, value: long });
  });
});
