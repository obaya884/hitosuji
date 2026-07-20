import { describe, expect, it } from "vitest";
import type {
  RoutineRepository,
  RoutineTaskSeed,
} from "@/usecases/ports/routine-repository";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { Routine } from "@/domain/routine/routine";
import type { Section } from "@/domain/section/section";
import type { Task } from "@/domain/task/task";
import { expandRoutinesFor } from "./expand-routines";
import { inMemoryTaskRepository } from "@/usecases/task/testing/in-memory-task-repository";

const sections: Section[] = [
  { id: 1, name: "深夜", startTime: "00:00", isArchived: false },
  { id: 2, name: "朝", startTime: "06:00", isArchived: false },
  { id: 3, name: "午前", startTime: "09:00", isArchived: false },
];

const sectionRepo: SectionRepository = {
  listAll: async () => sections,
  create: async () => sections[0],
  update: async () => {},
  setArchived: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};

function routine(over: Partial<Routine> & { id: number }): Routine {
  return {
    name: `R${over.id}`,
    estimateMinutes: 20,
    scheduledStartTime: "06:30",
    modeId: null,
    projectId: null,
    recurrenceType: "daily",
    weekdays: null,
    monthDay: null,
    intervalDays: null,
    startDate: "2026-01-01",
    endDate: null,
    isActive: true,
    ...over,
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

/** 展開された種を記録するだけのリポジトリ（永続化の冪等性は統合テストで検証済み） */
function recordingRoutineRepo(all: readonly Routine[], skipped: readonly number[] = []) {
  const expanded: RoutineTaskSeed[] = [];
  const repo: RoutineRepository = {
    listAll: async () => [...all],
    findById: async (id) => all.find((r) => r.id === id) ?? null,
    create: async () => all[0],
    update: async () => {},
    setActive: async () => {},
    delete: async () => {},
    expand: async (seeds) => {
      expanded.push(...seeds);
      return seeds.length;
    },
    listSkippedOn: async () => [...skipped],
  };
  return { repo, expanded };
}

const TODAY = "2026-07-19";

describe("expandRoutinesFor（データモデル定義書 §4.1）", () => {
  it("開始想定時刻を含むセクションへ配置する（§4.1-2）", async () => {
    const { repo, expanded } = recordingRoutineRepo([
      routine({ id: 1, scheduledStartTime: "06:30" }), // 朝
      routine({ id: 2, scheduledStartTime: "10:00" }), // 午前
      routine({ id: 3, scheduledStartTime: "02:00" }), // 深夜
    ]);

    await expandRoutinesFor(
      { routines: repo, sections: sectionRepo, tasks: inMemoryTaskRepository() },
      TODAY,
      TODAY
    );

    expect(expanded.map((s) => [s.routineId, s.sectionId])).toEqual([
      [3, 1], // 02:00 → 深夜（開始想定時刻の昇順で先頭）
      [1, 2], // 06:30 → 朝
      [2, 3], // 10:00 → 午前
    ]);
  });

  it("セクション内の既存タスクの末尾へ採番する（§4.1-3）", async () => {
    const { repo, expanded } = recordingRoutineRepo([routine({ id: 1 })]); // 朝
    const tasks = inMemoryTaskRepository([task({ id: 9, sectionId: 2, sortOrder: 5000 })]);

    await expandRoutinesFor({ routines: repo, sections: sectionRepo, tasks }, TODAY, TODAY);

    expect(expanded[0].sortOrder).toBe(6000);
  });

  it("同一セクションへ複数展開するとき採番が重ならない", async () => {
    const { repo, expanded } = recordingRoutineRepo([
      routine({ id: 1, scheduledStartTime: "06:10" }),
      routine({ id: 2, scheduledStartTime: "06:20" }),
      routine({ id: 3, scheduledStartTime: "06:30" }),
    ]);

    await expandRoutinesFor(
      { routines: repo, sections: sectionRepo, tasks: inMemoryTaskRepository() },
      TODAY,
      TODAY
    );

    expect(expanded.map((s) => s.sortOrder)).toEqual([1000, 2000, 3000]);
  });

  it("ルーチンの属性を生成タスクへ引き継ぐ", async () => {
    const { repo, expanded } = recordingRoutineRepo([
      routine({ id: 1, name: "朝食", estimateMinutes: 25, modeId: 7, projectId: 8 }),
    ]);

    await expandRoutinesFor(
      { routines: repo, sections: sectionRepo, tasks: inMemoryTaskRepository() },
      TODAY,
      TODAY
    );

    expect(expanded[0]).toEqual(
      expect.objectContaining({
        taskDate: TODAY,
        name: "朝食",
        estimateMinutes: 25,
        modeId: 7,
        projectId: 8,
      })
    );
  });

  it("過去日は展開しない（§4.1-0）", async () => {
    const { repo, expanded } = recordingRoutineRepo([routine({ id: 1 })]);

    const count = await expandRoutinesFor(
      { routines: repo, sections: sectionRepo, tasks: inMemoryTaskRepository() },
      "2026-07-18",
      TODAY
    );

    expect(count).toBe(0);
    expect(expanded).toEqual([]);
  });

  it("該当するルーチンがなければ何もしない", async () => {
    const { repo, expanded } = recordingRoutineRepo([routine({ id: 1, isActive: false })]);

    expect(
      await expandRoutinesFor(
        { routines: repo, sections: sectionRepo, tasks: inMemoryTaskRepository() },
        TODAY,
        TODAY
      )
    ).toBe(0);
    expect(expanded).toEqual([]);
  });

  it("その日にスキップされたルーチンは展開しない（F-304 / §3.6）", async () => {
    const { repo, expanded } = recordingRoutineRepo(
      [routine({ id: 1 }), routine({ id: 2 })],
      [1] // ルーチン1はスキップ済み
    );

    await expandRoutinesFor(
      { routines: repo, sections: sectionRepo, tasks: inMemoryTaskRepository() },
      TODAY,
      TODAY
    );

    expect(expanded.map((s) => s.routineId)).toEqual([2]);
  });

  it("有効セクションがなければ未分類へ置く", async () => {
    const emptySections: SectionRepository = { ...sectionRepo, listAll: async () => [] };
    const { repo, expanded } = recordingRoutineRepo([routine({ id: 1 })]);

    await expandRoutinesFor(
      { routines: repo, sections: emptySections, tasks: inMemoryTaskRepository() },
      TODAY,
      TODAY
    );

    expect(expanded[0].sectionId).toBeNull();
  });
});
