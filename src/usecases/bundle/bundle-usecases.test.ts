import { describe, expect, it } from "vitest";
import { COLOR_BY_NAME } from "@/domain/shared/color-presets";
import type { Bundle } from "@/domain/bundle/bundle";
import {
  createBundle,
  deleteBundle,
  listBundles,
  setBundleArchived,
  updateBundle,
} from "./bundle-usecases";
import { createInMemoryBundleRepository } from "./testing/in-memory-repository";

const indigo = COLOR_BY_NAME["インディゴ"];
const green = COLOR_BY_NAME["緑"];

const morning: Bundle = { id: 1, name: "朝の立上げ", color: indigo, isArchived: false };
const archivedUsed: Bundle = { id: 2, name: "旧束ね", color: green, isArchived: true };
const archivedFree: Bundle = { id: 3, name: "誤作成", color: green, isArchived: true };

describe("listBundles（画面定義書05 §3.1）", () => {
  it("有効とアーカイブ済みに分け、名前の自然順に並べる", async () => {
    const repo = createInMemoryBundleRepository([
      { id: 10, name: "10.夜", color: green, isArchived: false },
      { id: 11, name: "2.昼", color: green, isArchived: false },
      morning,
    ]);
    const view = await listBundles(repo);
    expect(view.active.map((b) => b.name)).toEqual(["2.昼", "10.夜", "朝の立上げ"]);
    expect(view.archived).toEqual([]);
  });

  it("参照0件のアーカイブ済みだけを削除可能として返す（F-405）", async () => {
    const repo = createInMemoryBundleRepository([morning, archivedUsed, archivedFree], {
      [archivedUsed.id]: 3,
    });
    const view = await listBundles(repo);
    expect(view.deletableIds).toEqual([archivedFree.id]);
  });
});

describe("updateBundle / setBundleArchived（画面定義書05 §6: すでに削除された対象への操作）", () => {
  it("対象が無ければ not_found を返す", async () => {
    const repo = createInMemoryBundleRepository([]);
    expect(await updateBundle(repo, 99, { name: "朝", color: indigo })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await setBundleArchived(repo, 99, true)).toEqual({ ok: false, error: "not_found" });
  });

  it("検証を通らない入力は永続化しない", async () => {
    const repo = createInMemoryBundleRepository([morning]);
    expect(await updateBundle(repo, morning.id, { name: "", color: indigo })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect((await repo.listAll())[0].name).toBe("朝の立上げ");
  });
});

describe("deleteBundle（画面定義書05 §5: 削除直前にサーバで再チェックする）", () => {
  it("ボタン表示後に参照が生まれていたら削除しない", async () => {
    const repo = createInMemoryBundleRepository([archivedFree], { [archivedFree.id]: 1 });
    const result = await deleteBundle(repo, archivedFree.id);
    expect(result.ok).toBe(false);
    expect(await repo.listAll()).toHaveLength(1);
  });

  it("アーカイブ済み・参照0件なら削除する", async () => {
    const repo = createInMemoryBundleRepository([archivedFree]);
    expect(await deleteBundle(repo, archivedFree.id)).toEqual({ ok: true, value: archivedFree.id });
    expect(await repo.listAll()).toEqual([]);
  });
});

describe("createBundle", () => {
  it("検証を通れば作成する", async () => {
    const repo = createInMemoryBundleRepository([]);
    const result = await createBundle(repo, { name: "  夕方の締め  ", color: green });
    expect(result).toEqual({
      ok: true,
      value: { id: expect.any(Number), name: "夕方の締め", color: green, isArchived: false },
    });
  });
});
