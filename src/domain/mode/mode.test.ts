import { describe, expect, it } from "vitest";
import { MODE_COLORS, validateModeInput } from "./mode";

describe("validateModeInput（画面定義書03 §3.2: 色はプリセットから選択・自由入力なし）", () => {
  it("プリセット色なら有効", () => {
    const r = validateModeInput({ name: "仕事", color: MODE_COLORS[0] });
    expect(r).toEqual({ ok: true, value: { name: "仕事", color: MODE_COLORS[0] } });
  });

  it("プリセット外の色はエラー", () => {
    const r = validateModeInput({ name: "仕事", color: "#123456" });
    expect(r).toEqual({ ok: false, error: "invalid_color" });
  });

  it("名前が空ならエラー", () => {
    const r = validateModeInput({ name: "", color: MODE_COLORS[0] });
    expect(r).toEqual({ ok: false, error: "name_required" });
  });

  it("プリセットは13色で、初期データ「休憩」のグレーを含む", () => {
    expect(MODE_COLORS).toHaveLength(13);
    expect(MODE_COLORS).toContain("#9ca3af");
  });
});
