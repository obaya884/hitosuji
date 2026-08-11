import { describe, expect, it } from "vitest";
import { COLOR_BY_NAME, COLOR_PRESETS, COLOR_VALUES, colorPresetName, isPresetColor } from "./color-presets";

describe("COLOR_PRESETS（画面定義書03 §3.2: プリセット13色と併記する色名）", () => {
  // 色値と色名の対応そのものが仕様（§3.2 の表）なので、表をそのまま突き合わせて固定する
  it("色値と色名が §3.2 の表と1:1で対応する（12色＋グレー）", () => {
    expect(COLOR_PRESETS).toEqual([
      { value: "#ef4444", name: "赤" },
      { value: "#f97316", name: "オレンジ" },
      { value: "#f59e0b", name: "琥珀" },
      { value: "#eab308", name: "黄" },
      { value: "#84cc16", name: "ライム" },
      { value: "#22c55e", name: "緑" },
      { value: "#14b8a6", name: "ティール" },
      { value: "#06b6d4", name: "シアン" },
      { value: "#3b82f6", name: "青" },
      { value: "#6366f1", name: "インディゴ" },
      { value: "#a855f7", name: "紫" },
      { value: "#ec4899", name: "ピンク" },
      { value: "#9ca3af", name: "グレー" },
    ]);
  });

  // 6桁 hex であることは `src/app/_testing/dom.ts` の `rgbOf` が前提にしている（それ以外は throw する）
  it("COLOR_VALUES はプリセットの色値（6桁 hex）を持つ", () => {
    expect(COLOR_VALUES).toHaveLength(COLOR_PRESETS.length);
    for (const color of COLOR_VALUES) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("COLOR_BY_NAME は色名から色値を引ける（初期データ用。データモデル定義書 §5）", () => {
    for (const { value, name } of COLOR_PRESETS) {
      expect(COLOR_BY_NAME[name]).toBe(value);
    }
  });
});

describe("colorPresetName（画面定義書03 §3.2: バーの横に色名を併記する）", () => {
  it("プリセット全色が対になっている色名を返す", () => {
    for (const { value, name } of COLOR_PRESETS) {
      expect(colorPresetName(value)).toBe(name);
    }
  });

  it("未知の色を渡しても落ちず、色そのもの（hex値）を返す", () => {
    expect(colorPresetName("#123456")).toBe("#123456");
  });
});

describe("isPresetColor（画面定義書03 §3.2: プリセット外の色は受け付けない）", () => {
  it("プリセットの色値を受け入れる", () => {
    for (const { value } of COLOR_PRESETS) expect(isPresetColor(value)).toBe(true);
  });

  it("プリセット外の色を弾く", () => {
    expect(isPresetColor("#123456")).toBe(false);
    expect(isPresetColor("")).toBe(false);
  });
});
