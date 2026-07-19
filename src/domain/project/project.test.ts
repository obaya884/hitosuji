import { describe, expect, it } from "vitest";
import { validateProjectInput } from "./project";

describe("validateProjectInput（画面定義書03 §3.3: 名前はテキスト必須）", () => {
  it("名前の前後の空白を除去して返す", () => {
    expect(validateProjectInput({ name: " 引越し " })).toEqual({
      ok: true,
      value: { name: "引越し" },
    });
  });

  it("空文字・空白のみはエラー", () => {
    expect(validateProjectInput({ name: "   " })).toEqual({ ok: false, error: "name_required" });
  });
});
