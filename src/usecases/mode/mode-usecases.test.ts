import { describe, expect, it } from "vitest";
import type { ModeInput, ModeRepository } from "@/usecases/ports/mode-repository";
import { MODE_COLOR_PRESETS, type Mode, type ModeId } from "@/domain/mode/mode";
import { createMode, deleteMode, listModes, setModeArchived, updateMode } from "./mode-usecases";

// 古典学派: Port の契約を満たすインメモリ実装（テスト戦略定義書 §2）
function inMemoryRepo(
  initial: readonly Mode[] = [],
  counts: Readonly<Record<ModeId, number>> = {}
): ModeRepository & { rows: Mode[] } {
  const rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  return {
    rows,
    listAll: async () => [...rows],
    create: async (input: ModeInput) => {
      const created: Mode = { id: nextId++, ...input, isArchived: false };
      rows.push(created);
      return created;
    },
    // 対象が無ければ何もしない（本物の `WHERE id = ?` が0行で終わるのと同じ契約）。
    // 揃えないと `rows[-1]` への書き込み・`splice(-1, 1)` による末尾行の巻き添えが静かに起こる
    update: async (id: ModeId, input: ModeInput) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i !== -1) rows[i] = { ...rows[i], ...input };
    },
    setArchived: async (id: ModeId, isArchived: boolean) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i !== -1) rows[i] = { ...rows[i], isArchived };
    },
    referenceCounts: async (ids: readonly ModeId[]) =>
      Object.fromEntries(ids.filter((id) => id in counts).map((id) => [id, counts[id]])),
    remove: async (id: ModeId) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i !== -1) rows.splice(i, 1);
    },
  };
}

const blue = MODE_COLOR_PRESETS[8].value;

describe("listModes（画面定義書03 §4: name 昇順・アーカイブ済みは別枠）", () => {
  it("有効とアーカイブ済みを分け、それぞれ名前順に返す", async () => {
    const repo = inMemoryRepo([
      { id: 1, name: "02.暮らし", color: blue, isArchived: false },
      { id: 2, name: "01.仕事", color: blue, isArchived: false },
      { id: 3, name: "旧モード", color: blue, isArchived: true },
    ]);
    const view = await listModes(repo);
    expect(view.active.map((m) => m.name)).toEqual(["01.仕事", "02.暮らし"]);
    expect(view.archived.map((m) => m.id)).toEqual([3]);
  });

  it("削除できるのは参照0件のアーカイブ済みだけ（画面定義書03 §4.1）", async () => {
    const repo = inMemoryRepo(
      [
        { id: 1, name: "有効", color: blue, isArchived: false },
        { id: 2, name: "参照あり", color: blue, isArchived: true },
        { id: 3, name: "参照なし", color: blue, isArchived: true },
      ],
      { 2: 5 }
    );
    expect((await listModes(repo)).deletableIds).toEqual([3]);
  });
});

describe("createMode / updateMode", () => {
  it("プリセット色なら永続化する", async () => {
    const repo = inMemoryRepo();
    expect((await createMode(repo, { name: "仕事", color: blue })).ok).toBe(true);
    expect(repo.rows).toHaveLength(1);
  });

  it("プリセット外の色は永続化しない", async () => {
    const repo = inMemoryRepo();
    expect(await createMode(repo, { name: "仕事", color: "#000000" })).toEqual({
      ok: false,
      error: "invalid_color",
    });
    expect(repo.rows).toHaveLength(0);
  });

  it("名前と色を更新する", async () => {
    const green = MODE_COLOR_PRESETS[4].value;
    const repo = inMemoryRepo([{ id: 1, name: "仕事", color: blue, isArchived: false }]);

    expect((await updateMode(repo, 1, { name: "しごと", color: green })).ok).toBe(true);
    expect(repo.rows).toEqual([{ id: 1, name: "しごと", color: green, isArchived: false }]);
  });

  it("名前が空なら更新しない", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "仕事", color: blue, isArchived: false }]);
    expect(await updateMode(repo, 1, { name: "", color: blue })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect(repo.rows[0].name).toBe("仕事");
  });

  // 検証は作成と更新で同じ1本（`validateModeInput`）を通る
  it("更新経路でも名前を trim する", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "仕事", color: blue, isArchived: false }]);
    expect((await updateMode(repo, 1, { name: " しごと ", color: blue })).ok).toBe(true);
    expect(repo.rows[0].name).toBe("しごと");
  });

  it("更新経路でもプリセット外の色は弾き、行を書き換えない", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "仕事", color: blue, isArchived: false }]);
    expect(await updateMode(repo, 1, { name: "仕事", color: "#000000" })).toEqual({
      ok: false,
      error: "invalid_color",
    });
    expect(repo.rows[0].color).toBe(blue);
  });
});

describe("setModeArchived", () => {
  it("アーカイブと復元の両方ができる（最低1件の制約はモードにはない）", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "仕事", color: blue, isArchived: false }]);
    await setModeArchived(repo, 1, true);
    expect(repo.rows[0].isArchived).toBe(true);
    await setModeArchived(repo, 1, false);
    expect(repo.rows[0].isArchived).toBe(false);
  });
});

describe("deleteMode（画面定義書03 §4.1: 物理削除）", () => {
  it("アーカイブ済み・参照0件なら削除する", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "誤作成", color: blue, isArchived: true }]);
    expect((await deleteMode(repo, 1)).ok).toBe(true);
    expect(repo.rows).toHaveLength(0);
  });

  it("参照があれば削除しない（ボタン表示後に参照が生まれた場合の再チェック）", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "使用中", color: blue, isArchived: true }], {
      1: 1,
    });
    expect(await deleteMode(repo, 1)).toEqual({ ok: false, error: "has_references" });
    expect(repo.rows).toHaveLength(1);
  });

  it("有効なモードは削除しない", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "仕事", color: blue, isArchived: false }]);
    expect(await deleteMode(repo, 1)).toEqual({ ok: false, error: "not_archived" });
    expect(repo.rows).toHaveLength(1);
  });
});

// 他の画面・端末で削除されたモードを触った場合（プロジェクト・セクションと同じ規則）
describe("存在しないモードへの更新（00_共通 §4.1: 1行も当たらない更新を成功として返さない）", () => {
  /** 唯一の行（id: 1）とは別の id。削除済みのモードを触った状況を表す */
  const MISSING = 2;
  const notFound = { ok: false, error: "not_found" };

  it("updateMode は失敗を返し、残っている行を書き換えない", async () => {
    const survivor: Mode = { id: 1, name: "仕事", color: blue, isArchived: false };
    const repo = inMemoryRepo([survivor]);
    expect(await updateMode(repo, MISSING, { name: "新名", color: blue })).toEqual(notFound);
    expect(repo.rows).toEqual([survivor]);
  });

  it("setModeArchived は失敗を返し、残っている行を書き換えない", async () => {
    const survivor: Mode = { id: 1, name: "仕事", color: blue, isArchived: false };
    const repo = inMemoryRepo([survivor]);
    expect(await setModeArchived(repo, MISSING, true)).toEqual(notFound);
    expect(repo.rows).toEqual([survivor]);
  });

  it("入力が無効なら検証エラーを優先して返す", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "仕事", color: blue, isArchived: false }]);
    expect(await updateMode(repo, MISSING, { name: "", color: blue })).toEqual({
      ok: false,
      error: "name_required",
    });
  });
});
