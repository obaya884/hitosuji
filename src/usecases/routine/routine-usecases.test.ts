import { describe, expect, it } from "vitest";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { Task } from "@/domain/task/task";
import { inMemoryTaskRepository } from "@/usecases/task/testing/in-memory-repository";
import { createRoutineFromTask } from "./routine-usecases";
import { inMemoryRoutineRepository } from "./testing/in-memory-repository";

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

const choice: RoutineFromTaskChoice = {
  recurrenceType: "daily",
  weekdays: null,
  monthDay: 19,
  intervalDays: 2,
  scheduledStartTime: "08:05",
};

describe("createRoutineFromTask（F-305 / 画面定義書01 §4.1）", () => {
  it("タスクの名前・見積もり・モード・プロジェクトを引き継ぎ、開始日は翌日にする", async () => {
    const tasks = inMemoryTaskRepository([task({ id: 1, name: "メールチェック" })]);
    const routines = inMemoryRoutineRepository();

    const result = await createRoutineFromTask({ routines, tasks }, 1, choice);

    expect(result.ok).toBe(true);
    expect(routines.rows).toHaveLength(1);
    expect(routines.rows[0]).toMatchObject({
      name: "メールチェック",
      estimateMinutes: 30,
      modeId: 2,
      projectId: 3,
      recurrenceType: "daily",
      scheduledStartTime: "08:05",
      startDate: "2026-07-20", // 元タスクの翌日（当日の二重展開を防ぐ）
      endDate: null,
      isActive: true,
    });
  });

  it("存在しないタスクIDでは作成しない", async () => {
    const tasks = inMemoryTaskRepository([task({ id: 1 })]);
    const routines = inMemoryRoutineRepository();

    const result = await createRoutineFromTask({ routines, tasks }, 999, choice);

    expect(result).toEqual({ ok: false, error: "task_not_found" });
    expect(routines.rows).toHaveLength(0);
  });

  it("ルーチン由来のタスクからは作成しない（§4.1: 変更は S-02 で行う）", async () => {
    const tasks = inMemoryTaskRepository([task({ id: 1, routineId: 7 })]);
    const routines = inMemoryRoutineRepository();

    const result = await createRoutineFromTask({ routines, tasks }, 1, choice);

    expect(result).toEqual({ ok: false, error: "routine_derived_task" });
    expect(routines.rows).toHaveLength(0);
  });

  it("見積もりも実績もないタスクは作成しない（§4.1: 見積もり0分の扱い）", async () => {
    const tasks = inMemoryTaskRepository([task({ id: 1, estimateMinutes: 0 })]);
    const routines = inMemoryRoutineRepository();

    const result = await createRoutineFromTask({ routines, tasks }, 1, choice);

    expect(result).toEqual({ ok: false, error: "estimate_required" });
    expect(routines.rows).toHaveLength(0);
  });

  it("入力値が不正なときはドメインの検証エラーを返す（週次で曜日未選択）", async () => {
    const tasks = inMemoryTaskRepository([task({ id: 1 })]);
    const routines = inMemoryRoutineRepository();

    const result = await createRoutineFromTask({ routines, tasks }, 1, {
      ...choice,
      recurrenceType: "weekly",
      weekdays: 0,
    });

    expect(result).toEqual({ ok: false, error: "weekdays_required" });
    expect(routines.rows).toHaveLength(0);
  });
});
