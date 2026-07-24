import { describe, expect, it } from "vitest";
import type { Mode } from "../mode/mode";
import type { Project } from "../project/project";
import { compareByName } from "../shared/name-order";
import { sortRoutines, type RoutineSortMasters } from "./order";
import type { Routine } from "./routine";

function routine(over: Partial<Routine> & { id: number }): Routine {
  return {
    name: `R${over.id}`,
    estimateMinutes: 30,
    scheduledStartTime: "09:00",
    modeId: null,
    projectId: null,
    recurrenceType: "daily",
    weekdays: null,
    weekInterval: null,
    monthDay: null,
    intervalDays: null,
    startDate: "2026-07-01",
    endDate: null,
    isActive: true,
    ...over,
  };
}

function mode(id: number, name: string): Mode {
  return { id, name, color: "#3b82f6", isArchived: false };
}

function project(id: number, name: string): Project {
  return { id, name, isArchived: false };
}

const masters: RoutineSortMasters = {
  modes: [mode(1, "仕事"), mode(2, "生活")],
  projects: [project(1, "改善"), project(2, "経理")],
};

const emptyMasters: RoutineSortMasters = { modes: [], projects: [] };

function names(routines: readonly Routine[]): string[] {
  return routines.map((r) => r.name);
}

describe("sortRoutines（画面定義書02 §3.1）", () => {
  it("name asc: 名前の自然順（数値プレフィックスを数値として比較）", () => {
    const input = [
      routine({ id: 1, name: "10.タスク" }),
      routine({ id: 2, name: "2.タスク" }),
      routine({ id: 3, name: "1.タスク" }),
    ];
    const result = sortRoutines(input, emptyMasters, "name", "asc");
    expect(names(result)).toEqual(["1.タスク", "2.タスク", "10.タスク"]);
  });

  it("name desc: 反転する", () => {
    const input = [
      routine({ id: 1, name: "1.タスク" }),
      routine({ id: 2, name: "2.タスク" }),
      routine({ id: 3, name: "10.タスク" }),
    ];
    const result = sortRoutines(input, emptyMasters, "name", "desc");
    expect(names(result)).toEqual(["10.タスク", "2.タスク", "1.タスク"]);
  });

  it("同値のときの順序: モードが同じ行は第2キー（名前の自然順）で並ぶ", () => {
    const input = [
      routine({ id: 1, name: "い", modeId: 1 }),
      routine({ id: 2, name: "あ", modeId: 1 }),
    ];
    const result = sortRoutines(input, masters, "mode", "asc");
    expect(names(result)).toEqual(["あ", "い"]);
  });

  it("未設定の扱い: モード未設定（modeId=null）の行は昇順・降順とも末尾", () => {
    const input = [
      routine({ id: 1, name: "未設定行", modeId: null }),
      routine({ id: 2, name: "生活の行", modeId: 2 }),
      routine({ id: 3, name: "仕事の行", modeId: 1 }),
    ];
    const asc = sortRoutines(input, masters, "mode", "asc");
    expect(names(asc)).toEqual(["仕事の行", "生活の行", "未設定行"]);

    const desc = sortRoutines(input, masters, "mode", "desc");
    expect(names(desc)).toEqual(["生活の行", "仕事の行", "未設定行"]);
  });

  it("未設定の扱い: マスタに見つからない modeId も未設定と同じ扱いにする", () => {
    const input = [
      routine({ id: 1, name: "存在しないモード", modeId: 999 }),
      routine({ id: 2, name: "仕事の行", modeId: 1 }),
    ];
    const result = sortRoutines(input, masters, "mode", "asc");
    expect(names(result)).toEqual(["仕事の行", "存在しないモード"]);
  });

  it("未設定の扱い: プロジェクト未設定・マスタ不在の行も末尾（昇順）", () => {
    const input = [
      routine({ id: 1, name: "未設定行", projectId: null }),
      routine({ id: 2, name: "見つからない行", projectId: 999 }),
      routine({ id: 3, name: "改善の行", projectId: 1 }),
      routine({ id: 4, name: "経理の行", projectId: 2 }),
    ];
    const result = sortRoutines(input, masters, "project", "asc");
    // 未設定同士の並びも第2キー（名前の自然順）に従う
    expect(names(result)).toEqual(["改善の行", "経理の行", "見つからない行", "未設定行"]);
  });

  it("未設定の扱い: 降順では未設定を末尾に置いたまま、未設定同士の並びも反転する", () => {
    const input = [
      routine({ id: 1, name: "未設定B", projectId: null }),
      routine({ id: 2, name: "未設定A", projectId: null }),
      routine({ id: 3, name: "改善の行", projectId: 1 }),
      routine({ id: 4, name: "経理の行", projectId: 2 }),
    ];
    const result = sortRoutines(input, masters, "project", "desc");
    // 末尾に置く規則は固定。それ以外（未設定グループ内の名前順も含む）は反転する
    expect(names(result)).toEqual(["経理の行", "改善の行", "未設定B", "未設定A"]);
  });

  it("繰り返しの順序: 毎日→週次→月次→n日ごと（昇順）", () => {
    const input = [
      routine({ id: 1, name: "A", recurrenceType: "interval", intervalDays: 3 }),
      routine({ id: 2, name: "B", recurrenceType: "monthly", monthDay: 1 }),
      routine({ id: 3, name: "C", recurrenceType: "daily" }),
      routine({ id: 4, name: "D", recurrenceType: "weekly", weekdays: 1 }),
    ];
    const result = sortRoutines(input, emptyMasters, "recurrence", "asc");
    expect(names(result)).toEqual(["C", "D", "B", "A"]);
  });

  it("繰り返しの順序: 降順は反転する（n日ごと→月次→週次→毎日）", () => {
    const input = [
      routine({ id: 1, name: "A", recurrenceType: "interval", intervalDays: 3 }),
      routine({ id: 2, name: "B", recurrenceType: "monthly", monthDay: 1 }),
      routine({ id: 3, name: "C", recurrenceType: "daily" }),
      routine({ id: 4, name: "D", recurrenceType: "weekly", weekdays: 1 }),
    ];
    const result = sortRoutines(input, emptyMasters, "recurrence", "desc");
    expect(names(result)).toEqual(["A", "B", "D", "C"]);
  });

  it("開始想定時刻: 昇順・同時刻は名前の自然順", () => {
    const input = [
      routine({ id: 1, name: "10.同時刻", scheduledStartTime: "08:00" }),
      routine({ id: 2, name: "2.同時刻", scheduledStartTime: "08:00" }),
      routine({ id: 3, name: "早い", scheduledStartTime: "06:30" }),
    ];
    const result = sortRoutines(input, emptyMasters, "scheduledStartTime", "asc");
    expect(names(result)).toEqual(["早い", "2.同時刻", "10.同時刻"]);
  });

  it("開始想定時刻: 降順は反転する", () => {
    const input = [
      routine({ id: 1, name: "早い", scheduledStartTime: "06:30" }),
      routine({ id: 2, name: "遅い", scheduledStartTime: "13:30" }),
    ];
    const result = sortRoutines(input, emptyMasters, "scheduledStartTime", "desc");
    expect(names(result)).toEqual(["遅い", "早い"]);
  });

  it("引数の配列を破壊的にソートしない", () => {
    const input = [
      routine({ id: 1, name: "b", scheduledStartTime: "10:00" }),
      routine({ id: 2, name: "a", scheduledStartTime: "06:00" }),
    ];
    const before = [...input];
    sortRoutines(input, emptyMasters, "scheduledStartTime", "asc");
    expect(input).toEqual(before);
  });

  it("既定（scheduledStartTime/asc）は現行の listRoutines と同じ並びになる", () => {
    const input = [
      routine({ id: 1, name: "経費精算", scheduledStartTime: "13:30" }),
      routine({ id: 2, name: "朝食", scheduledStartTime: "06:30" }),
      routine({ id: 3, name: "週次レビュー", scheduledStartTime: "10:00" }),
      routine({ id: 4, name: "同時刻2", scheduledStartTime: "10:00" }),
    ];

    // listRoutines（src/usecases/routine/usecases.ts）と同じ並べ替え式
    const expected = [...input].sort(
      (a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime) || compareByName(a, b)
    );

    const result = sortRoutines(input, emptyMasters, "scheduledStartTime", "asc");
    expect(names(result)).toEqual(names(expected));
  });
});
