import { describe, expect, it } from "vitest";
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import type { ProjectRepository } from "@/usecases/ports/project-repository";
import { inMemoryTaskRepository } from "@/usecases/task/testing/in-memory-task-repository";
import type { Mode } from "@/domain/mode/mode";
import type { Task } from "@/domain/task/task";
import { listDailyReview } from "./review-usecases";

const modes: Mode[] = [
  { id: 10, name: "仕事", color: "#3b82f6", isArchived: false },
  { id: 20, name: "旧枠", color: "#9ca3af", isArchived: true },
];

const modeRepo: ModeRepository = {
  listAll: async () => [...modes],
  create: async () => modes[0],
  update: async () => {},
  setArchived: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};
const projectRepo: ProjectRepository = {
  listAll: async () => [],
  create: async () => ({ id: 1, name: "", isArchived: false }),
  update: async () => {},
  setArchived: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};

function at(date: string, clock: string): Date {
  return new Date(`${date}T${clock}:00+09:00`);
}

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 0,
    sectionId: null,
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

function depsOf(tasks: readonly Task[]) {
  return { tasks: inMemoryTaskRepository(tasks), modes: modeRepo, projects: projectRepo };
}

const done = {
  id: 1,
  modeId: 10,
  startedAt: at("2026-07-19", "08:00"),
  endedAt: at("2026-07-19", "09:00"),
};

describe("listDailyReview（画面定義書04 §3: 指定日の振り返り）", () => {
  it("表示日のタスクだけを対象にする", async () => {
    const view = await listDailyReview(
      depsOf([
        task(done),
        task({ id: 2, taskDate: "2026-07-18", startedAt: at("2026-07-18", "08:00") }),
      ]),
      { date: "2026-07-19", today: "2026-07-20" }
    );
    expect(view.log.map((t) => t.id)).toEqual([1]);
  });

  it("実績合計とモード別・プロジェクト別の集計を返す（F-503 / §3.5）", async () => {
    const view = await listDailyReview(
      depsOf([
        task(done),
        task({
          id: 2,
          projectId: 30,
          startedAt: at("2026-07-19", "09:00"),
          endedAt: at("2026-07-19", "09:30"),
        }),
      ]),
      { date: "2026-07-19", today: "2026-07-20" }
    );
    expect(view.totalMinutes).toBe(90);
    expect(view.modeTotals).toEqual([
      { key: 10, minutes: 60 },
      { key: null, minutes: 30 },
    ]);
    expect(view.projectTotals).toEqual([
      { key: 30, minutes: 30 },
      { key: null, minutes: 60 },
    ]);
  });

  it("過去日では未実行タスクを先送りとして返す（F-502 / §3.4）", async () => {
    const view = await listDailyReview(depsOf([task(done), task({ id: 2 })]), {
      date: "2026-07-19",
      today: "2026-07-20",
    });
    expect(view.postponed?.map((t) => t.id)).toEqual([2]);
  });

  it("今日は先送り数を出さない（まだ実行されうるため。§3.4）", async () => {
    const view = await listDailyReview(depsOf([task({ id: 2 })]), {
      date: "2026-07-19",
      today: "2026-07-19",
    });
    expect(view.postponed).toBeNull();
  });

  it("未来日でも先送り数を出さない（§3.4）", async () => {
    const view = await listDailyReview(depsOf([task({ id: 2 })]), {
      date: "2026-07-20",
      today: "2026-07-19",
    });
    expect(view.postponed).toBeNull();
  });

  it("アーカイブ済みマスタも返す（過去タスクから参照されるため。§3.5）", async () => {
    const view = await listDailyReview(depsOf([task(done)]), {
      date: "2026-07-19",
      today: "2026-07-20",
    });
    expect(view.modes.map((m) => m.id)).toEqual([10, 20]);
  });
});
