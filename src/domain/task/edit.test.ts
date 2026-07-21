import { describe, expect, it } from "vitest";
import { validateEstimateMinutes, validateTaskName } from "./edit";

describe("validateTaskName（画面定義書01 §8: 空のタスク名は確定不可）", () => {
  it("前後の空白を除去して返す", () => {
    expect(validateTaskName(" 設計書レビュー ")).toEqual({ ok: true, value: "設計書レビュー" });
  });

  it("空・空白のみはエラー", () => {
    expect(validateTaskName("")).toEqual({ ok: false, error: "name_required" });
    expect(validateTaskName("　")).toEqual({ ok: false, error: "name_required" });
  });
});

describe("validateEstimateMinutes（画面定義書01 §3.3/§8: 分整数入力・非数値/負値は確定不可）", () => {
  it("分の整数を受け付ける", () => {
    expect(validateEstimateMinutes("30")).toEqual({ ok: true, value: 30 });
    expect(validateEstimateMinutes(" 90 ")).toEqual({ ok: true, value: 90 });
  });

  it("空入力は未設定（0分）へ戻す", () => {
    expect(validateEstimateMinutes("")).toEqual({ ok: true, value: 0 });
  });

  it("0 は未設定として許容する", () => {
    expect(validateEstimateMinutes("0")).toEqual({ ok: true, value: 0 });
  });

  it("負値・非数値・小数はエラー", () => {
    expect(validateEstimateMinutes("-5")).toEqual({ ok: false, error: "invalid_estimate" });
    expect(validateEstimateMinutes("abc")).toEqual({ ok: false, error: "invalid_estimate" });
    expect(validateEstimateMinutes("1.5")).toEqual({ ok: false, error: "invalid_estimate" });
  });

  it("桁が大きく安全な整数を外れる入力はエラー（正規表現は通るが確定不可）", () => {
    expect(validateEstimateMinutes("99999999999999999999")).toEqual({
      ok: false,
      error: "invalid_estimate",
    });
  });
});
