import { describe, expect, it } from "vitest";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { Section } from "@/domain/section/section";
import type { Task } from "@/domain/task/task";
import { moveTaskByOneStep, moveTaskTo, setTaskSection } from "./reorder-usecases";
import { inMemoryTaskRepository } from "./testing/in-memory-task-repository";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 0,
    sectionId: 1,
    modeId: null,
    projectId: null,
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

const sections: Section[] = [
  { id: 1, name: "朝", startTime: "06:00", isArchived: false },
  { id: 2, name: "午前", startTime: "09:00", isArchived: false },
];

const sectionRepo: SectionRepository = {
  listAll: async () => sections,
  create: async () => sections[0],
  update: async () => {},
  setArchived: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};

describe("moveTaskTo（O-6: ドラッグ＆ドロップ）", () => {
  it("同じセクション内で位置を変える", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 2000 }),
      task({ id: 3, sortOrder: 3000 }),
    ]);

    expect(
      (await moveTaskTo(repo, { taskId: 3, date: "2026-07-19", sectionId: 1, index: 0 })).ok
    ).toBe(true);
    expect(repo.rows.find((t) => t.id === 3)?.sortOrder).toBe(0);
  });

  it("セクションをまたぐ移動で section_id が変わる", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: 2, sortOrder: 1000 }),
    ]);

    await moveTaskTo(repo, { taskId: 1, date: "2026-07-19", sectionId: 2, index: 1 });

    const moved = repo.rows.find((t) => t.id === 1);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([2, 2000]);
  });

  it("他の日付のタスクは採番に影響しない（sort_order は task_date ごとに独立）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, taskDate: "2026-07-18", sortOrder: 5000 }),
      task({ id: 2, taskDate: "2026-07-19", sortOrder: 1000 }),
      task({ id: 3, taskDate: "2026-07-19", sortOrder: 2000 }),
    ]);

    // 表示日のグループ（id:2, id:3）だけを見て採番する。前日の 5000 は無関係
    await moveTaskTo(repo, { taskId: 2, date: "2026-07-19", sectionId: 1, index: 1 });
    expect(repo.rows.find((t) => t.id === 2)?.sortOrder).toBe(3000);
    expect(repo.rows.find((t) => t.id === 1)?.sortOrder).toBe(5000); // 他日付は不変
  });

  it("中間値が尽きたら同一グループを振り直す", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 1001 }),
      task({ id: 3, sortOrder: 5000 }),
    ]);

    await moveTaskTo(repo, { taskId: 3, date: "2026-07-19", sectionId: 1, index: 1 });

    expect(repo.rows.map((t) => [t.id, t.sortOrder])).toEqual([
      [1, 1000],
      [2, 3000],
      [3, 2000],
    ]);
  });
});

describe("moveTaskByOneStep（画面定義書01 §6: Shift+J/K）", () => {
  it("下へ1つ移動する", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 2000 }),
      task({ id: 3, sortOrder: 3000 }),
    ]);

    await moveTaskByOneStep(
      { tasks: repo, sections: sectionRepo },
      { taskId: 1, date: "2026-07-19", step: 1 }
    );
    expect(repo.rows.find((t) => t.id === 1)?.sortOrder).toBe(2500);
  });

  it("グループ末尾から下へ動かすと次のセクションへ移る", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: 2, sortOrder: 1000 }),
    ]);

    await moveTaskByOneStep(
      { tasks: repo, sections: sectionRepo },
      { taskId: 1, date: "2026-07-19", step: 1 }
    );
    expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(2);
  });

  it("未分類のタスクを下へ動かすと最初のセクションへ入る", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: null, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 1000 }),
    ]);

    await moveTaskByOneStep(
      { tasks: repo, sections: sectionRepo },
      { taskId: 1, date: "2026-07-19", step: 1 }
    );
    expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(1);
  });

  it("存在しないタスクはエラー", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(
      await moveTaskByOneStep(
        { tasks: repo, sections: sectionRepo },
        { taskId: 99, date: "2026-07-19", step: 1 }
      )
    ).toEqual({ ok: false, error: "task_not_found" });
  });
});

describe("setTaskSection（O-5: セクションの割り当て）", () => {
  it("移動先セクションの末尾へ置く（データモデル定義書 §3.5）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: null, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 1000 }),
      task({ id: 3, sectionId: 1, sortOrder: 2000 }),
    ]);

    await setTaskSection(repo, { taskId: 1, date: "2026-07-19", sectionId: 1 });

    const moved = repo.rows.find((t) => t.id === 1);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([1, 3000]);
  });

  it("未分類（null）へ戻せる", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: null, sortOrder: 1000 }),
    ]);

    await setTaskSection(repo, { taskId: 1, date: "2026-07-19", sectionId: null });

    const moved = repo.rows.find((t) => t.id === 1);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([null, 2000]);
  });

  it("空のセクションへ割り当てられる", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: null, sortOrder: 1000 })]);

    await setTaskSection(repo, { taskId: 1, date: "2026-07-19", sectionId: 2 });

    const moved = repo.rows.find((t) => t.id === 1);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([2, 1000]);
  });
});
