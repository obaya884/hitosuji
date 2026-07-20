import { describe, expect, it } from "vitest";
import type { ProjectInput, ProjectRepository } from "@/usecases/ports/project-repository";
import type { Project, ProjectId } from "@/domain/project/project";
import {
  createProject,
  deleteProject,
  listProjects,
  setProjectArchived,
  updateProject,
} from "./project-usecases";

// 古典学派: Port の契約を満たすインメモリ実装（アーキテクチャ定義書 §8）
function inMemoryRepo(
  initial: readonly Project[] = [],
  counts: Readonly<Record<ProjectId, number>> = {}
): ProjectRepository & { rows: Project[] } {
  const rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  return {
    rows,
    listAll: async () => [...rows],
    create: async (input: ProjectInput) => {
      const created: Project = { id: nextId++, ...input, isArchived: false };
      rows.push(created);
      return created;
    },
    update: async (id: ProjectId, input: ProjectInput) => {
      const i = rows.findIndex((r) => r.id === id);
      rows[i] = { ...rows[i], ...input };
    },
    setArchived: async (id: ProjectId, isArchived: boolean) => {
      const i = rows.findIndex((r) => r.id === id);
      rows[i] = { ...rows[i], isArchived };
    },
    referenceCounts: async (ids: readonly ProjectId[]) =>
      Object.fromEntries(ids.filter((id) => id in counts).map((id) => [id, counts[id]])),
    remove: async (id: ProjectId) => {
      rows.splice(
        rows.findIndex((r) => r.id === id),
        1
      );
    },
  };
}

describe("listProjects（画面定義書03 §4: name 昇順・アーカイブ済みは別枠）", () => {
  it("有効とアーカイブ済みを分け、それぞれ名前順に返す", async () => {
    const repo = inMemoryRepo([
      { id: 1, name: "10.引越し", isArchived: false },
      { id: 2, name: "02.確定申告", isArchived: false },
      { id: 3, name: "完了済み", isArchived: true },
    ]);
    const view = await listProjects(repo);
    expect(view.active.map((p) => p.name)).toEqual(["02.確定申告", "10.引越し"]);
    expect(view.archived.map((p) => p.id)).toEqual([3]);
  });

  it("削除できるのは参照0件のアーカイブ済みだけ（画面定義書03 §4.1）", async () => {
    const repo = inMemoryRepo(
      [
        { id: 1, name: "有効", isArchived: false },
        { id: 2, name: "参照あり", isArchived: true },
        { id: 3, name: "参照なし", isArchived: true },
      ],
      { 2: 2 }
    );
    expect((await listProjects(repo)).deletableIds).toEqual([3]);
  });
});

describe("deleteProject（画面定義書03 §4.1: 物理削除）", () => {
  it("アーカイブ済み・参照0件なら削除する", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "誤作成", isArchived: true }]);
    expect((await deleteProject(repo, 1)).ok).toBe(true);
    expect(repo.rows).toHaveLength(0);
  });

  it("参照があれば削除しない", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "使用中", isArchived: true }], { 1: 3 });
    expect(await deleteProject(repo, 1)).toEqual({ ok: false, error: "has_references" });
    expect(repo.rows).toHaveLength(1);
  });

  it("有効なプロジェクトは削除しない", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "引越し", isArchived: false }]);
    expect(await deleteProject(repo, 1)).toEqual({ ok: false, error: "not_archived" });
  });
});

describe("createProject / updateProject", () => {
  it("名前を trim して永続化する", async () => {
    const repo = inMemoryRepo();
    expect((await createProject(repo, { name: " 引越し " })).ok).toBe(true);
    expect(repo.rows[0].name).toBe("引越し");
  });

  it("名前が空なら永続化しない", async () => {
    const repo = inMemoryRepo();
    expect(await createProject(repo, { name: "  " })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect(repo.rows).toHaveLength(0);
  });

  it("名前が空なら更新しない", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "引越し", isArchived: false }]);
    expect(await updateProject(repo, 1, { name: "" })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect(repo.rows[0].name).toBe("引越し");
  });
});

describe("setProjectArchived", () => {
  it("アーカイブと復元の両方ができる", async () => {
    const repo = inMemoryRepo([{ id: 1, name: "引越し", isArchived: false }]);
    await setProjectArchived(repo, 1, true);
    expect(repo.rows[0].isArchived).toBe(true);
    await setProjectArchived(repo, 1, false);
    expect(repo.rows[0].isArchived).toBe(false);
  });
});
