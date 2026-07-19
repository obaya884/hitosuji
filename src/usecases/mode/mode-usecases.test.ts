import { describe, expect, it } from "vitest";
import type { ModeInput, ModeRepository } from "@/usecases/ports/mode-repository";
import { MODE_COLORS, type Mode, type ModeId } from "@/domain/mode/mode";
import { createMode, listModes, setModeArchived, updateMode } from "./mode-usecases";

// 古典学派: Port の契約を満たすインメモリ実装（アーキテクチャ定義書 §8）
function inMemoryRepo(initial: readonly Mode[] = []): ModeRepository & { rows: Mode[] } {
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
    update: async (id: ModeId, input: ModeInput) => {
      const i = rows.findIndex((r) => r.id === id);
      rows[i] = { ...rows[i], ...input };
    },
    setArchived: async (id: ModeId, isArchived: boolean) => {
      const i = rows.findIndex((r) => r.id === id);
      rows[i] = { ...rows[i], isArchived };
    },
  };
}

const blue = MODE_COLORS[8];

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

  it("名前が空なら更新しない", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "仕事", color: blue, isArchived: false }]);
    expect(await updateMode(repo, 1, { name: "", color: blue })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect(repo.rows[0].name).toBe("仕事");
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
