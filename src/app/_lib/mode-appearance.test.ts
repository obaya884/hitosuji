import { describe, expect, it } from "vitest";
import type { Mode } from "@/domain/mode/mode";
import { modeAppearance, toDimmedClass } from "./mode-appearance";

const work: Mode = { id: 1, name: "仕事", color: "#ef4444", isArchived: false };

// デイリー（画面定義書01 §3.3）とレビュー（同04 §2「モード色は S-01 と同じ」）で共有する規則
describe("modeAppearance（F-401 / 画面定義書01 §3.3「モード未設定行の色」・04 §2）", () => {
  it("モード設定時は行の色を継承させる（グレーにしない）", () => {
    expect(modeAppearance(work)).toStrictEqual({
      isDimmed: false,
      dimmedClass: "",
      colorStyle: { color: "#ef4444" },
    });
  });

  it("モード未設定時は副次情報の色にし、テキスト色は指定しない（既定の文字色のまま）", () => {
    // toStrictEqual なので `{ color: undefined }` を返す実装では落ちる（色キーごと載せない）
    expect(modeAppearance(undefined)).toStrictEqual({
      isDimmed: true,
      dimmedClass: "text-ink-muted",
      colorStyle: {},
    });
  });

  // アーカイブ済みマスタは選択肢から消えるだけで、参照中のタスクの表示には従来どおり使う（画面定義書03 §4）
  it("アーカイブ済みモードでも未設定扱いにしない（色を継承させる）", () => {
    expect(modeAppearance({ ...work, isArchived: true })).toStrictEqual({
      isDimmed: false,
      dimmedClass: "",
      colorStyle: { color: "#ef4444" },
    });
  });
});

describe("toDimmedClass（判定だけを受け取る側＝`AssignCell` の入口）", () => {
  it("真なら副次情報の色、偽なら何も付けない", () => {
    expect(toDimmedClass(true)).toBe("text-ink-muted");
    expect(toDimmedClass(false)).toBe("");
  });
});
