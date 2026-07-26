import { describe, expect, it } from "vitest";
import {
  MODE_COLOR_BY_NAME,
  MODE_COLOR_PRESETS,
  MODE_COLORS,
  modeColorName,
  validateModeInput,
} from "./mode";

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
});

describe("MODE_COLOR_PRESETS（画面定義書03 §3.2: プリセット13色と併記する色名）", () => {
  // 色値と色名の対応そのものが仕様（§3.2 の表）なので、表をそのまま突き合わせて固定する
  it("色値と色名が §3.2 の表と1:1で対応する（12色＋グレー）", () => {
    expect(MODE_COLOR_PRESETS).toEqual([
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

  it("MODE_COLORS はプリセットの色値（6桁 hex）だけを同じ並びで持つ", () => {
    expect(MODE_COLORS).toEqual(MODE_COLOR_PRESETS.map((p) => p.value));
    for (const color of MODE_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("MODE_COLOR_BY_NAME は色名から色値を引ける（初期データ用。データモデル定義書 §5）", () => {
    for (const { value, name } of MODE_COLOR_PRESETS) {
      expect(MODE_COLOR_BY_NAME[name]).toBe(value);
    }
  });
});

describe("modeColorName（画面定義書03 §3.2: バーの横に色名を併記する）", () => {
  it("プリセット全色が対になっている色名を返す", () => {
    for (const { value, name } of MODE_COLOR_PRESETS) {
      expect(modeColorName(value)).toBe(name);
    }
  });

  it("未知の色を渡しても落ちず、色そのもの（hex値）を返す", () => {
    expect(modeColorName("#123456")).toBe("#123456");
  });
});
