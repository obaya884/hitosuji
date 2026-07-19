import { describe, expect, it } from "vitest";
import type { NewTask, TaskRepository } from "@/application/ports/task-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task } from "@/domain/task/task";
import { addTask } from "./daily-list-usecases";

// 古典学派: Port の契約を満たすインメモリ実装（アーキテクチャ定義書 §8）
function inMemoryRepo(initial: readonly Task[] = []): TaskRepository & { rows: Task[] } {
  const rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  return {
    rows,
    listByDate: async (date: LogicalDate) => rows.filter((r) => r.taskDate === date),
    create: async (input: NewTask) => {
      const created: Task = {
        id: nextId++,
        ...input,
        startedAt: null,
        endedAt: null,
        comment: null,
        routineId: null,
        splitParentId: null,
        postponedCount: 0,
      };
      rows.push(created);
      return created;
    },
  };
}

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
