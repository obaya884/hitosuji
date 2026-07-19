import { describe, expect, it } from "vitest";
import type { Task } from "@/domain/task/task";
import { inMemoryTaskRepository as inMemoryRepo } from "./testing/in-memory-task-repository";
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import type { ProjectRepository } from "@/usecases/ports/project-repository";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import {
  addTask,
  listDailyList,
  renameTask,
  updateTaskEstimate,
} from "./daily-list-usecases";

const emptySectionRepo: SectionRepository = {
  listAll: async () => [],
  create: async () => ({ id: 1, name: "", startTime: "00:00", isArchived: false }),
  update: async () => {},
  setArchived: async () => {},
};
const emptyModeRepo: ModeRepository = {
  listAll: async () => [],
  create: async () => ({ id: 1, name: "", color: "#000000", isArchived: false }),
  update: async () => {},
  setArchived: async () => {},
};
const emptyProjectRepo: ProjectRepository = {
  listAll: async () => [],
  create: async () => ({ id: 1, name: "", isArchived: false }),
  update: async () => {},
  setArchived: async () => {},
};

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 0,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

describe("addTask（F-102 / 画面定義書01 §3.4: クイック追加）", () => {
  it("タスク名のみで、見積もり未設定・未実行・未分類のタスクを作る", async () => {
    const repo = inMemoryRepo();
    const result = await addTask(repo, { date: "2026-07-19", name: "買い出しメモ" });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        taskDate: "2026-07-19",
        name: "買い出しメモ",
        estimateMinutes: 0,
        sectionId: null,
        modeId: null,
        projectId: null,
        startedAt: null,
        endedAt: null,
      }),
    });
  });

  it("未分類グループの末尾へ置く（sort_order は未分類の最大値+1000）", async () => {
    const repo = inMemoryRepo([
      task({ id: 1, sectionId: null, sortOrder: 2000 }),
      task({ id: 2, sectionId: 5, sortOrder: 9000 }), // 別セクションの値には影響されない
    ]);
    const result = await addTask(repo, { date: "2026-07-19", name: "新タスク" });
    expect(result.ok && result.value.sortOrder).toBe(3000);
  });

  it("他の日付のタスクは採番に影響しない（task_date ごとに独立）", async () => {
    const repo = inMemoryRepo([task({ id: 1, taskDate: "2026-07-18", sortOrder: 8000 })]);
    const result = await addTask(repo, { date: "2026-07-19", name: "新タスク" });
    expect(result.ok && result.value.sortOrder).toBe(1000);
  });

  it("空白のみの名前では作らない（§8: 何もしない）", async () => {
    const repo = inMemoryRepo();
    expect(await addTask(repo, { date: "2026-07-19", name: "   " })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect(repo.rows).toHaveLength(0);
  });

  it("名前の前後の空白は除去する", async () => {
    const repo = inMemoryRepo();
    const result = await addTask(repo, { date: "2026-07-19", name: " 朝食 " });
    expect(result.ok && result.value.name).toBe("朝食");
  });
});

describe("renameTask（F-102: タスク名のインライン編集）", () => {
  it("前後の空白を除いて改名する", async () => {
    const repo = inMemoryRepo([task({ id: 1, name: "旧名" })]);
    expect((await renameTask(repo, 1, " 新名 ")).ok).toBe(true);
    expect(repo.rows[0].name).toBe("新名");
  });

  it("空の名前では改名しない（§8: 確定不可）", async () => {
    const repo = inMemoryRepo([task({ id: 1, name: "旧名" })]);
    expect(await renameTask(repo, 1, "  ")).toEqual({ ok: false, error: "name_required" });
    expect(repo.rows[0].name).toBe("旧名");
  });
});

describe("updateTaskEstimate（F-103: 見積もりのインライン編集）", () => {
  it("分の整数を保存する", async () => {
    const repo = inMemoryRepo([task({ id: 1, estimateMinutes: 0 })]);
    expect((await updateTaskEstimate(repo, 1, "45")).ok).toBe(true);
    expect(repo.rows[0].estimateMinutes).toBe(45);
  });

  it("空入力は未設定（0分）へ戻す", async () => {
    const repo = inMemoryRepo([task({ id: 1, estimateMinutes: 30 })]);
    expect((await updateTaskEstimate(repo, 1, "")).ok).toBe(true);
    expect(repo.rows[0].estimateMinutes).toBe(0);
  });

  it("非数値・負値では保存しない（§8: 確定不可）", async () => {
    const repo = inMemoryRepo([task({ id: 1, estimateMinutes: 30 })]);
    expect(await updateTaskEstimate(repo, 1, "-10")).toEqual({
      ok: false,
      error: "invalid_estimate",
    });
    expect(repo.rows[0].estimateMinutes).toBe(30);
  });
});

describe("listDailyList の警告対象（画面定義書01 §8: 前日以前の実行中タスク）", () => {
  const deps = (tasks: TaskRepository) => ({
    tasks,
    sections: emptySectionRepo,
    modes: emptyModeRepo,
    projects: emptyProjectRepo,
  });

  it("実行中タスクが表示日より前ならバナー対象として返す", async () => {
    const repo = inMemoryRepo([
      task({ id: 1, taskDate: "2026-07-18", startedAt: new Date("2026-07-18T23:00:00Z") }),
    ]);
    const view = await listDailyList(deps(repo), "2026-07-19");
    expect(view.staleRunningTask?.id).toBe(1);
  });

  it("実行中タスクが表示日と同じ日なら対象にしない", async () => {
    const repo = inMemoryRepo([
      task({ id: 1, taskDate: "2026-07-19", startedAt: new Date("2026-07-19T09:00:00Z") }),
    ]);
    const view = await listDailyList(deps(repo), "2026-07-19");
    expect(view.staleRunningTask).toBeNull();
  });

  it("未来日を表示中に当日の実行中タスクがあっても対象にする（放置の検知が目的）", async () => {
    const repo = inMemoryRepo([
      task({ id: 1, taskDate: "2026-07-19", startedAt: new Date("2026-07-19T09:00:00Z") }),
    ]);
    const view = await listDailyList(deps(repo), "2026-07-20");
    expect(view.staleRunningTask?.id).toBe(1);
  });

  it("実行中タスクがなければ対象なし", async () => {
    const repo = inMemoryRepo([task({ id: 1, taskDate: "2026-07-18" })]);
    const view = await listDailyList(deps(repo), "2026-07-19");
    expect(view.staleRunningTask).toBeNull();
  });
});
