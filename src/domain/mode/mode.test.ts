import { describe, expect, it } from "vitest";
import { COLOR_PRESETS } from "../shared/color-presets";
import { validateModeInput } from "./mode";

describe("validateModeInput（画面定義書03 §3.2: 色はプリセットから選択・自由入力なし）", () => {
  it("プリセット色なら有効", () => {
    const r = validateModeInput({ name: "仕事", color: COLOR_PRESETS[0].value });
    expect(r).toEqual({ ok: true, value: { name: "仕事", color: COLOR_PRESETS[0].value } });
  });

  it("プリセット外の色はエラー", () => {
    const r = validateModeInput({ name: "仕事", color: "#123456" });
    expect(r).toEqual({ ok: false, error: "invalid_color" });
  });

  it("名前が空ならエラー", () => {
    const r = validateModeInput({ name: "", color: COLOR_PRESETS[0].value });
    expect(r).toEqual({ ok: false, error: "name_required" });
  });
});
