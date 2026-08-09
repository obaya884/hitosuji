import { describe, expect, it } from "vitest";
import { COLOR_BY_NAME } from "../shared/color-presets";
import { validateBundleInput } from "./bundle";

describe("validateBundleInput（画面定義書05 §6: 名前と色の検証）", () => {
  it("名前と色を検証して通す", () => {
    const r = validateBundleInput({ name: "朝の立上げ", color: COLOR_BY_NAME["インディゴ"] });
    expect(r).toEqual({
      ok: true,
      value: { name: "朝の立上げ", color: COLOR_BY_NAME["インディゴ"] },
    });
  });

  it("前後の空白を落として保存する", () => {
    const r = validateBundleInput({ name: "  朝の立上げ  ", color: COLOR_BY_NAME["緑"] });
    expect(r).toEqual({ ok: true, value: { name: "朝の立上げ", color: COLOR_BY_NAME["緑"] } });
  });

  it("空・空白のみの名前は確定できない", () => {
    expect(validateBundleInput({ name: "", color: COLOR_BY_NAME["緑"] })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect(validateBundleInput({ name: "   ", color: COLOR_BY_NAME["緑"] })).toEqual({
      ok: false,
      error: "name_required",
    });
  });

  it("プリセット外の色は受け付けない", () => {
    expect(validateBundleInput({ name: "朝の立上げ", color: "#123456" })).toEqual({
      ok: false,
      error: "invalid_color",
    });
  });
});
