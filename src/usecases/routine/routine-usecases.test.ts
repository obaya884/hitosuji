import { describe, expect, it } from "vitest";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { RoutineInput } from "@/domain/routine/input";
import { ALL_WEEKDAYS } from "@/domain/routine/routine";
import { routine } from "@/domain/routine/testing/routine";
import { task } from "@/domain/task/testing/task";
import { inMemoryTaskRepository } from "@/usecases/task/testing/in-memory-repository";
import {
  createRoutineFromTask,
  deleteRoutine,
  listRoutines,
  setRoutineActive,
  updateRoutine,
} from "./routine-usecases";
import { inMemoryRoutineRepository } from "./testing/in-memory-repository";

function input(over: Partial<RoutineInput> = {}): RoutineInput {
  return {
    name: "朝食",
    estimateMinutes: 20,
    scheduledStartTime: "06:30",
    modeId: null,
    projectId: null,
    recurrenceType: "daily",
    weekdays: null,
    weekInterval: null,
    monthDay: null,
    intervalDays: null,
    startDate: "2026-07-19",
    endDate: null,
    ...over,
  };
}

const choice: RoutineFromTaskChoice = {
  recurrenceType: "daily",
  weekdays: null,
  weekInterval: null,
  monthDay: 19,
  intervalDays: 2,
  scheduledStartTime: "08:05",
};

describe("createRoutineFromTask（F-305 / 画面定義書01 §4.1）", () => {
  it("タスクの名前・見積もり・モード・プロジェクトを引き継ぎ、開始日は翌日にする", async () => {
    const tasks = inMemoryTaskRepository([
      task({ id: 1, name: "メールチェック", estimateMinutes: 30, modeId: 2, projectId: 3 }),
    ]);
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
      startDate: "2026-07-27", // 元タスクの翌日（当日の二重展開を防ぐ）
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
    // 見積もりは通る値にする（0 だと手前の estimate_required で落ちて曜日検証に届かない）
    const tasks = inMemoryTaskRepository([task({ id: 1, estimateMinutes: 30 })]);
    const routines = inMemoryRoutineRepository();

    const result = await createRoutineFromTask({ routines, tasks }, 1, {
      ...choice,
      recurrenceType: "weekly",
      weekdays: 0,
    });

    expect(result).toEqual({ ok: false, error: "weekdays_required" });
    expect(routines.rows).toHaveLength(0);
  });

  it("週次で全曜日かつ週間隔1を選ぶと「毎日」として保存する（データモデル定義書 §3.4）", async () => {
    const tasks = inMemoryTaskRepository([task({ id: 1, estimateMinutes: 30 })]);
    const routines = inMemoryRoutineRepository();

    const result = await createRoutineFromTask({ routines, tasks }, 1, {
      ...choice,
      recurrenceType: "weekly",
      weekdays: ALL_WEEKDAYS,
      weekInterval: 1,
    });

    expect(result.ok).toBe(true);
    expect(routines.rows[0]).toMatchObject({
      recurrenceType: "daily",
      weekdays: null,
      weekInterval: null,
    });
  });
});

describe("listRoutines（画面定義書02 §3: 開始想定時刻の昇順・同時刻は名前の自然順）", () => {
  it("開始想定時刻の昇順に並べ、同時刻は名前の自然順にする", async () => {
    const routines = inMemoryRoutineRepository([
      routine({ id: 1, name: "掃除", scheduledStartTime: "12:00" }),
      routine({ id: 2, name: "10.夜筋トレ", scheduledStartTime: "06:30" }),
      routine({ id: 3, name: "02.朝食", scheduledStartTime: "06:30" }),
    ]);

    expect((await listRoutines(routines)).map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("空なら空配列", async () => {
    expect(await listRoutines(inMemoryRoutineRepository())).toEqual([]);
  });
});

describe("updateRoutine（画面定義書02 O-2: 編集は未展開の日から反映）", () => {
  it("既存ルーチンを更新する", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1, name: "朝食" })]);

    const result = await updateRoutine(routines, 1, input({ name: "朝の支度" }));

    expect(result).toEqual({ ok: true, value: 1 });
    expect(routines.rows[0].name).toBe("朝の支度");
  });

  it("存在しないルーチンは routine_not_found", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1 })]);

    expect(await updateRoutine(routines, 999, input())).toEqual({
      ok: false,
      error: "routine_not_found",
    });
  });

  it("入力が不正なら検証エラーを返し、永続化しない", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1, name: "朝食" })]);

    const result = await updateRoutine(
      routines,
      1,
      input({ recurrenceType: "weekly", weekdays: 0 })
    );

    expect(result).toEqual({ ok: false, error: "weekdays_required" });
    expect(routines.rows[0].name).toBe("朝食"); // 更新されていない
  });

  it("週次の全曜日かつ週間隔1へ更新すると「毎日」として保存する（データモデル定義書 §3.4）", async () => {
    const routines = inMemoryRoutineRepository([
      routine({ id: 1, recurrenceType: "weekly", weekdays: 0b0010101, weekInterval: 1 }),
    ]);

    const result = await updateRoutine(
      routines,
      1,
      input({ recurrenceType: "weekly", weekdays: ALL_WEEKDAYS, weekInterval: 1 })
    );

    expect(result).toEqual({ ok: true, value: 1 });
    expect(routines.rows[0]).toMatchObject({
      recurrenceType: "daily",
      weekdays: null,
      weekInterval: null,
    });
  });
});

describe("setRoutineActive（画面定義書02 O-3: 有効/無効の切替）", () => {
  it("有効を無効へ、無効を有効へ切り替える", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1, isActive: true })]);

    expect(await setRoutineActive(routines, 1, false)).toEqual({ ok: true, value: 1 });
    expect(routines.rows[0].isActive).toBe(false);

    expect(await setRoutineActive(routines, 1, true)).toEqual({ ok: true, value: 1 });
    expect(routines.rows[0].isActive).toBe(true);
  });

  it("存在しないルーチンは routine_not_found", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1 })]);

    expect(await setRoutineActive(routines, 999, false)).toEqual({
      ok: false,
      error: "routine_not_found",
    });
  });
});

describe("deleteRoutine（画面定義書02 O-4: 削除。展開済みタスクは残る）", () => {
  it("既存ルーチンを削除する", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1 }), routine({ id: 2 })]);

    expect(await deleteRoutine(routines, 1)).toEqual({ ok: true, value: 1 });
    expect(routines.rows.map((r) => r.id)).toEqual([2]);
  });

  it("存在しないルーチンは routine_not_found", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1 })]);

    expect(await deleteRoutine(routines, 999)).toEqual({
      ok: false,
      error: "routine_not_found",
    });
    expect(routines.rows).toHaveLength(1);
  });
});
