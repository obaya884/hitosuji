import { describe, expect, it } from "vitest";
import { MODE_COLOR_NAMES, MODE_COLORS, modeColorName, validateModeInput } from "./mode";

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

describe("modeColorName（画面定義書03 §3.2: バーの横に色名を併記する）", () => {
  it("プリセット全色に色名がある", () => {
    for (const color of MODE_COLORS) {
      expect(modeColorName(color)).toBe(MODE_COLOR_NAMES[color]);
      expect(modeColorName(color)).not.toBe("");
    }
  });

  it("未知の色を渡しても落ちず、色そのもの（hex値）を返す", () => {
    expect(modeColorName("#123456")).toBe("#123456");
  });
});
