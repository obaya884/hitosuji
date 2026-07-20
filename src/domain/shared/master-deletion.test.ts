import { describe, expect, it } from "vitest";
import { canDeleteMaster, deletableMasterIds } from "./master-deletion";

describe("canDeleteMaster（画面定義書03 §4.1: 物理削除）", () => {
  it("アーカイブ済みかつ参照0件なら削除できる", () => {
    expect(canDeleteMaster({ isArchived: true }, 0)).toEqual({ ok: true, value: true });
  });

  it("参照が1件でもあれば削除できない", () => {
    expect(canDeleteMaster({ isArchived: true }, 1)).toEqual({
      ok: false,
      error: "has_references",
    });
  });

  it("有効なマスタは削除できない（整理はアーカイブ→削除の順）", () => {
    expect(canDeleteMaster({ isArchived: false }, 0)).toEqual({
      ok: false,
      error: "not_archived",
    });
  });

  it("存在しないマスタはエラー", () => {
    expect(canDeleteMaster(null, 0)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("deletableMasterIds（画面定義書03 §4.1: 参照0件の行にのみボタンを出す）", () => {
  const masters = [
    { id: 1, isArchived: true },
    { id: 2, isArchived: true },
    { id: 3, isArchived: false },
  ];

  it("アーカイブ済みかつ参照0件の id だけを返す", () => {
    expect(deletableMasterIds(masters, { 1: 0, 2: 3 })).toEqual([1]);
  });

  it("件数の記載がない id は参照0件として扱う", () => {
    expect(deletableMasterIds(masters, {})).toEqual([1, 2]);
  });
});
