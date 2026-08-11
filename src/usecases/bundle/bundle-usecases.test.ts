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
import { inMemoryBundleRepository } from "./testing/in-memory-repository";

const indigo = COLOR_BY_NAME["インディゴ"];
const green = COLOR_BY_NAME["緑"];

const morning: Bundle = { id: 1, name: "朝の立上げ", color: indigo, isArchived: false };
const archivedUsed: Bundle = { id: 2, name: "旧束ね", color: green, isArchived: true };
const archivedFree: Bundle = { id: 3, name: "誤作成", color: green, isArchived: true };
const evening: Bundle = { id: 4, name: "夜のまとめ", color: green, isArchived: false };

describe("listBundles（画面定義書05 §3.1）", () => {
  it("有効とアーカイブ済みに分け、名前の自然順に並べる", async () => {
    const repo = inMemoryBundleRepository([
      { id: 10, name: "10.夜", color: green, isArchived: false },
      { id: 11, name: "2.昼", color: green, isArchived: false },
      morning,
    ]);
    const view = await listBundles(repo);
    expect(view.active.map((b) => b.name)).toEqual(["2.昼", "10.夜", "朝の立上げ"]);
    expect(view.archived).toEqual([]);
  });

  it("参照0件のアーカイブ済みだけを削除可能として返す（F-405）", async () => {
    const repo = inMemoryBundleRepository([morning, archivedUsed, archivedFree], {
      counts: { [archivedUsed.id]: 3 },
    });
    const view = await listBundles(repo);
    expect(view.deletableIds).toEqual([archivedFree.id]);
  });

  it("有効なバンドルごとにメンバー（ルーチン）件数を返す。0件は省略されるので呼び出し側は ?? 0 で補う", async () => {
    const repo = inMemoryBundleRepository([morning, evening], {
      memberCounts: { [morning.id]: 4 }, // evening は未指定＝0件
    });
    const view = await listBundles(repo);
    expect(view.memberCounts[morning.id]).toBe(4);
    expect(view.memberCounts[evening.id] ?? 0).toBe(0);
  });

  it("複数バンドルのメンバー件数を取り違えない", async () => {
    const repo = inMemoryBundleRepository([morning, evening], {
      memberCounts: { [morning.id]: 2, [evening.id]: 7 },
    });
    const view = await listBundles(repo);
    expect(view.memberCounts[morning.id]).toBe(2);
    expect(view.memberCounts[evening.id]).toBe(7);
  });

  it("有効なバンドルが0件ならメンバー件数を数えに行かない（無駄な問い合わせをしない）", async () => {
    const repo = inMemoryBundleRepository([archivedFree]);
    const view = await listBundles(repo);
    expect(view.memberCounts).toEqual({});
  });
});

describe("updateBundle / setBundleArchived（画面定義書05 §4 O-2・O-3 / §6）", () => {
  it("名前と色を書き換える（O-2）", async () => {
    const repo = inMemoryBundleRepository([morning]);

    expect(await updateBundle(repo, morning.id, { name: "朝の準備", color: green })).toEqual({
      ok: true,
      value: morning.id,
    });
    expect((await repo.listAll())[0]).toEqual({ ...morning, name: "朝の準備", color: green });
  });

  it("アーカイブと復元の両方向で isArchived が切り替わる（O-3）", async () => {
    const repo = inMemoryBundleRepository([morning]);

    expect(await setBundleArchived(repo, morning.id, true)).toEqual({
      ok: true,
      value: morning.id,
    });
    expect((await repo.listAll())[0].isArchived).toBe(true);

    expect(await setBundleArchived(repo, morning.id, false)).toEqual({
      ok: true,
      value: morning.id,
    });
    expect((await repo.listAll())[0].isArchived).toBe(false);
  });

  it("対象が無ければ not_found を返す", async () => {
    const repo = inMemoryBundleRepository([]);
    expect(await updateBundle(repo, 99, { name: "朝", color: indigo })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await setBundleArchived(repo, 99, true)).toEqual({ ok: false, error: "not_found" });
  });

  it("検証を通らない入力は永続化しない", async () => {
    const repo = inMemoryBundleRepository([morning]);
    expect(await updateBundle(repo, morning.id, { name: "", color: indigo })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect((await repo.listAll())[0].name).toBe("朝の立上げ");
  });
});

describe("deleteBundle（画面定義書05 §5: 削除直前にサーバで再チェックする）", () => {
  it("ボタン表示後に参照が生まれていたら削除しない", async () => {
    const repo = inMemoryBundleRepository([archivedFree], {
      counts: { [archivedFree.id]: 1 },
    });
    const result = await deleteBundle(repo, archivedFree.id);
    expect(result.ok).toBe(false);
    expect(await repo.listAll()).toHaveLength(1);
  });

  it("アーカイブ済み・参照0件なら削除する", async () => {
    const repo = inMemoryBundleRepository([archivedFree]);
    expect(await deleteBundle(repo, archivedFree.id)).toEqual({ ok: true, value: archivedFree.id });
    expect(await repo.listAll()).toEqual([]);
  });

  it("有効なバンドルは削除しない（アーカイブが先）", async () => {
    const repo = inMemoryBundleRepository([morning]);
    expect(await deleteBundle(repo, morning.id)).toEqual({ ok: false, error: "not_archived" });
    expect(await repo.listAll()).toHaveLength(1);
  });

  it("対象が無ければ not_found を返す", async () => {
    const repo = inMemoryBundleRepository([]);
    expect(await deleteBundle(repo, 99)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("createBundle", () => {
  it("検証を通れば作成する", async () => {
    const repo = inMemoryBundleRepository([]);
    const result = await createBundle(repo, { name: "  夕方の締め  ", color: green });
    expect(result).toEqual({
      ok: true,
      value: { id: expect.any(Number), name: "夕方の締め", color: green, isArchived: false },
    });
  });

  it("検証を通らない入力は作成しない", async () => {
    const repo = inMemoryBundleRepository([]);
    expect(await createBundle(repo, { name: "  ", color: green })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect(await repo.listAll()).toEqual([]);
  });
});
