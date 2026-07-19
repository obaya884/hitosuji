import { describe, expect, it } from "vitest";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { Section } from "@/domain/section/section";
import { taskStatus } from "@/domain/task/status";
import type { Task } from "@/domain/task/task";
import {
  deleteTask,
  duplicateTask,
  postponeTask,
  restoreTask,
  suspendTask,
} from "./task-operations";
import { inMemoryTaskRepository } from "./testing/in-memory-task-repository";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 30,
    sectionId: 1,
    modeId: 2,
    projectId: 3,
    sortOrder: over.id * 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

const now = new Date("2026-07-19T09:00:00Z");
const startedAt = new Date("2026-07-19T08:48:00Z"); // 実績12分

describe("suspendTask（F-204: 中断）", () => {
  it("現在時刻で終了し、残り見積もりの再開タスクを直後に作る", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, estimateMinutes: 30, startedAt, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 2000 }),
    ]);

    expect((await suspendTask(repo, { taskId: 1, now })).ok).toBe(true);

    expect(repo.rows[0].endedAt).toEqual(now);
    expect(repo.rows[2]).toEqual(
      expect.objectContaining({
        name: "T1",
        estimateMinutes: 18, // max(30 − 12, 1)
        splitParentId: 1,
        sortOrder: 1500, // 元タスク(1000)と次(2000)の中間 = 直後
        modeId: 2,
        projectId: 3,
        startedAt: null,
      })
    );
  });

  it("中断後は実行中タスクがいなくなる", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt })]);
    await suspendTask(repo, { taskId: 1, now });
    expect(repo.rows.filter((t) => taskStatus(t) === "running")).toHaveLength(0);
  });

  it("実行中でないタスクは中断できない", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1 })]);
    expect(await suspendTask(repo, { taskId: 1, now })).toEqual({
      ok: false,
      error: "not_running",
    });
  });
});

describe("duplicateTask（F-111: 複製）", () => {
  // 挿入位置は1日のリスト全体の表示順で決まり、section_id は挿入位置のセクションに従う
  const sections: Section[] = [
    { id: 1, name: "朝", startTime: "06:00", isArchived: false },
    { id: 2, name: "午前", startTime: "09:00", isArchived: false },
  ];
  const sectionRepo: SectionRepository = {
    listAll: async () => sections,
    create: async () => sections[0],
    update: async () => {},
    setArchived: async () => {},
  };
  const repos = (tasks: ReturnType<typeof inMemoryTaskRepository>) => ({
    tasks,
    sections: sectionRepo,
  });

  it("実行中タスクがあればその直後へ挿入する", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, startedAt, endedAt: now, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, startedAt, sortOrder: 2000 }), // 実行中
      task({ id: 3, sectionId: 1, sortOrder: 3000 }),
    ]);

    const result = await duplicateTask(repos(repo), { taskId: 1 });
    expect(result.ok && result.value.sortOrder).toBe(2500); // 実行中(2000)の直後
  });

  it("実行中がなければ最初の未実行タスクの直前へ挿入する", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, startedAt, endedAt: now, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 2000 }), // 最初の未実行
    ]);

    const result = await duplicateTask(repos(repo), { taskId: 1 });
    expect(result.ok && result.value.sortOrder).toBe(1500);
  });

  it("挿入位置が別セクションなら section_id もそのセクションに従う", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, startedAt, endedAt: now, sortOrder: 1000 }), // 朝・完了
      task({ id: 2, sectionId: 2, startedAt, sortOrder: 1000 }), // 午前・実行中
    ]);

    // 朝のタスクを複製すると、実行中タスク（午前）の直後に入る
    const result = await duplicateTask(repos(repo), { taskId: 1 });
    expect(result.ok && [result.value.sectionId, result.value.sortOrder]).toEqual([2, 2000]);
  });

  it("すべて完了ならリスト末尾（最後のセクション）へ挿入する", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, startedAt, endedAt: now, sortOrder: 1000 }),
      task({ id: 2, sectionId: 2, startedAt, endedAt: now, sortOrder: 1000 }),
    ]);

    const result = await duplicateTask(repos(repo), { taskId: 1 });
    expect(result.ok && result.value.sectionId).toBe(2);
  });

  it("完了タスクを複製しても未実行タスクとして作られる（見積もりは満額）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, estimateMinutes: 45, startedAt, endedAt: now }),
    ]);

    const result = await duplicateTask(repos(repo), { taskId: 1 });
    expect(result.ok && result.value).toEqual(
      expect.objectContaining({
        estimateMinutes: 45,
        startedAt: null,
        endedAt: null,
        splitParentId: null,
        routineId: null,
      })
    );
  });

  it("ルーチン由来のタスクを複製しても routine_id は引き継がない（冪等制約に抵触するため）", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, routineId: 9 })]);
    const result = await duplicateTask(repos(repo), { taskId: 1 });
    expect(result.ok && result.value.routineId).toBeNull();
  });

  it("中間値が尽きたら振り直しを伴って挿入する（操作は失敗しない）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, startedAt, endedAt: now, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 1001 }), // 最初の未実行。1000との間に隙間がない
    ]);

    const result = await duplicateTask(repos(repo), { taskId: 1 });
    expect(result.ok).toBe(true);

    const ordered = [...repo.rows].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(ordered.map((t) => t.id)).toEqual([1, 3, 2]); // 複製(id:3)が id:2 の直前に入る
  });
});

describe("postponeTask（F-107: 先送り）", () => {
  it("翌日へ移し postponed_count を加算する", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, postponedCount: 1 })]);

    expect((await postponeTask(repo, { taskId: 1 })).ok).toBe(true);
    expect(repo.rows[0]).toEqual(
      expect.objectContaining({ taskDate: "2026-07-20", postponedCount: 2 })
    );
  });

  it("移動先の同セクション末尾へ置く", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, taskDate: "2026-07-20", sectionId: 1, sortOrder: 5000 }),
    ]);

    await postponeTask(repo, { taskId: 1 });
    expect(repo.rows[0].sortOrder).toBe(6000);
  });

  it("日付を指定して先送りできる", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1 })]);
    await postponeTask(repo, { taskId: 1, to: "2026-07-25" });
    expect(repo.rows[0].taskDate).toBe("2026-07-25");
  });

  it("実行中・完了タスクは先送りできない", async () => {
    const running = inMemoryTaskRepository([task({ id: 1, startedAt })]);
    expect(await postponeTask(running, { taskId: 1 })).toEqual({
      ok: false,
      error: "not_postponable",
    });

    const completed = inMemoryTaskRepository([task({ id: 1, startedAt, endedAt: now })]);
    expect(await postponeTask(completed, { taskId: 1 })).toEqual({
      ok: false,
      error: "not_postponable",
    });
  });
});

describe("deleteTask / restoreTask（O-8: 削除と取り消し）", () => {
  it("削除したタスクを返す（Undo のために保持する）", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, name: "消すタスク" })]);

    const result = await deleteTask(repo, { taskId: 1 });
    expect(result.ok && result.value.name).toBe("消すタスク");
    expect(repo.rows).toHaveLength(0);
  });

  it("打刻を含めて復元できる（id は採番し直される）", async () => {
    const deleted = task({ id: 1, startedAt, endedAt: now, postponedCount: 2 });
    const repo = inMemoryTaskRepository([]);

    const result = await restoreTask(repo, deleted);
    expect(result.ok && result.value).toEqual(
      expect.objectContaining({
        name: "T1",
        startedAt,
        endedAt: now,
        postponedCount: 2,
      })
    );
    expect(repo.rows).toHaveLength(1);
  });

  it("存在しないタスクの削除はエラー", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(await deleteTask(repo, { taskId: 99 })).toEqual({
      ok: false,
      error: "task_not_found",
    });
  });
});
