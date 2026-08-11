import { describe, expect, it } from "vitest";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { RoutineInput } from "@/domain/routine/input";
import { ALL_WEEKDAYS } from "@/domain/routine/routine";
import { routine } from "@/domain/routine/testing/routine";
import { task } from "@/domain/task/testing/task";
import { inMemoryTaskRepository } from "@/usecases/task/testing/in-memory-repository";
import {
  addRoutineToBundle,
  createRoutine,
  createRoutineFromTask,
  deleteRoutine,
  listRoutines,
  removeRoutineFromBundle,
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
    bundleId: null,
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

describe("createRoutine（画面定義書02 O-1: フォーム入力→保存）", () => {
  it("検証を通れば永続化し、作られたルーチンを返す", async () => {
    const routines = inMemoryRoutineRepository();

    const result = await createRoutine(routines, input({ name: "朝の散歩" }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ name: "朝の散歩", isActive: true });
    expect(routines.rows).toHaveLength(1);
  });

  it("入力が不正なら検証エラーを返し、永続化しない", async () => {
    const routines = inMemoryRoutineRepository();

    const result = await createRoutine(
      routines,
      input({ recurrenceType: "weekly", weekdays: 0, weekInterval: 1 })
    );

    expect(result).toEqual({ ok: false, error: "weekdays_required" });
    expect(routines.rows).toHaveLength(0);
  });
});

describe("createRoutineFromTask（F-305 / 画面定義書01 §4.1）", () => {
  // FB-71: ルーチン名の文字数上限を撤廃した。上限が戻るとこの経路が汎用文言で失敗する
  it("名前が長いタスクからもルーチンを作り、名前をそのまま保存する", async () => {
    const name = "あ".repeat(200);
    const tasks = inMemoryTaskRepository([task({ id: 1, name, estimateMinutes: 30 })]);
    const routines = inMemoryRoutineRepository();

    const result = await createRoutineFromTask({ routines, tasks }, 1, choice);

    expect(result.ok).toBe(true);
    expect(routines.rows[0]).toMatchObject({ name });
  });

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

describe("addRoutineToBundle（画面定義書05 O-5: メンバーの追加）", () => {
  it("未所属のルーチンをバンドルに入れる", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1, bundleId: null })]);
    expect(await addRoutineToBundle(routines, 1, 5)).toEqual({ ok: true, value: 1 });
    expect((await routines.findById(1))?.bundleId).toBe(5);
  });

  it("すでに別のバンドルに入っていたら追加しない（画面定義書05 §6: 別タブでの操作）", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1, bundleId: 9 })]);
    expect(await addRoutineToBundle(routines, 1, 5)).toEqual({
      ok: false,
      error: "already_in_bundle",
    });
    expect((await routines.findById(1))?.bundleId).toBe(9);
  });

  it("同じバンドルへの再追加も already_in_bundle として扱う", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1, bundleId: 5 })]);
    expect(await addRoutineToBundle(routines, 1, 5)).toEqual({
      ok: false,
      error: "already_in_bundle",
    });
  });

  it("対象が無ければ not_found（画面定義書05 §6）", async () => {
    const routines = inMemoryRoutineRepository([]);
    expect(await addRoutineToBundle(routines, 99, 5)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("removeRoutineFromBundle（画面定義書05 O-6: メンバーを外す）", () => {
  it("バンドルから外す", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1, bundleId: 5 })]);
    expect(await removeRoutineFromBundle(routines, 1)).toEqual({ ok: true, value: 1 });
    expect((await routines.findById(1))?.bundleId).toBe(null);
  });

  it("すでに未所属でも成功として扱う（外した結果は同じ）", async () => {
    const routines = inMemoryRoutineRepository([routine({ id: 1, bundleId: null })]);
    expect(await removeRoutineFromBundle(routines, 1)).toEqual({ ok: true, value: 1 });
  });

  it("対象が無ければ not_found", async () => {
    const routines = inMemoryRoutineRepository([]);
    expect(await removeRoutineFromBundle(routines, 99)).toEqual({ ok: false, error: "not_found" });
  });
});
