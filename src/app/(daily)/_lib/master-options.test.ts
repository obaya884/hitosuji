import { describe, expect, it } from "vitest";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { toModeOptions, toProjectOptions } from "./master-options";

function mode(over: Partial<Mode> & { id: number; name: string }): Mode {
  return { color: "#3b82f6", isArchived: false, ...over };
}

function project(over: Partial<Project> & { id: number; name: string }): Project {
  return { isArchived: false, ...over };
}

describe("toModeOptions（画面定義書01 O-5 / F-401: モード選択の候補）", () => {
  it("「モードなし」を先頭に置き、渡された順のまま色付きで並べる", () => {
    // 並び順はマスタ取得側の責務（データモデル定義書 §1）なので、ここでは並べ替えないことを見る。
    // id 昇順とも名前順とも一致しない並びを渡し、どちらの sort が紛れ込んでも落ちるようにする
    const options = toModeOptions([
      mode({ id: 2, name: "生活", color: "#22c55e" }),
      mode({ id: 1, name: "仕事", color: "#ef4444" }),
    ]);

    expect(options).toStrictEqual([
      { id: null, label: "モードなし" },
      { id: 2, label: "生活", color: "#22c55e" },
      { id: 1, label: "仕事", color: "#ef4444" },
    ]);
  });

  it("アーカイブ済みモードは候補に出さない（画面定義書03 §4）", () => {
    const options = toModeOptions([
      mode({ id: 1, name: "仕事" }),
      mode({ id: 9, name: "旧", isArchived: true }),
    ]);

    expect(options.map((o) => o.id)).toEqual([null, 1]);
  });

  it("有効なモードが0件でも「モードなし」だけは残す（未設定へ戻せる）", () => {
    expect(toModeOptions([mode({ id: 9, name: "旧", isArchived: true })])).toStrictEqual([
      { id: null, label: "モードなし" },
    ]);
  });
});

describe("toProjectOptions（画面定義書01 O-5: プロジェクト選択の候補）", () => {
  it("「プロジェクトなし」を先頭に置き、渡された順のまま並べる。色は付けない", () => {
    // モード側と同じく、id 昇順とも名前順とも一致しない並びで渡す。
    // toStrictEqual なので `color: undefined` が紛れ込んでも落ちる（候補に色を持たせない）
    const options = toProjectOptions([project({ id: 4, name: "開発" }), project({ id: 3, name: "家事" })]);

    expect(options).toStrictEqual([
      { id: null, label: "プロジェクトなし" },
      { id: 4, label: "開発" },
      { id: 3, label: "家事" },
    ]);
  });

  it("アーカイブ済みプロジェクトは候補に出さない（画面定義書03 §4）", () => {
    const options = toProjectOptions([
      project({ id: 3, name: "開発" }),
      project({ id: 9, name: "旧", isArchived: true }),
    ]);

    expect(options.map((o) => o.id)).toEqual([null, 3]);
  });

  it("有効なプロジェクトが0件でも「プロジェクトなし」だけは残す（未設定へ戻せる）", () => {
    expect(toProjectOptions([])).toStrictEqual([{ id: null, label: "プロジェクトなし" }]);
  });
});
