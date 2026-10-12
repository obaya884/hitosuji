import { describe, expect, it } from "vitest";
import type { Section } from "../section/section";
import { atJst } from "../shared/testing/clock";
import {
  planDuplicate,
  planDuplicateAndStart,
  planPunchEdit,
  planStart,
  planSuspend,
  planUndoPunch,
} from "./placement";
import { task } from "./testing/task";

// 個々の位置の規則（開始時刻順の位置・現在位置・直下の採番）は relocation.test.ts / sort-order.test.ts が見る。
// ここは計画の**組み合わせ方**（どの規則をどの順で当て、何を基準にするか）だけを確かめる
const forenoon: Section = { id: 2, name: "午前", startTime: "09:00", isArchived: false };
const afternoon: Section = { id: 3, name: "午後", startTime: "12:00", isArchived: false };
const sections = [forenoon, afternoon];

describe("planStart（画面定義書01 O-2 / データモデル定義書 §4.2-b）", () => {
  const now = atJst("12:30");

  it("今日なら開始タスク自身を規則a で開始時刻のセクションへ移す（画面定義書01 §4.2-a）", () => {
    const target = task({ id: 1, sectionId: forenoon.id });
    const plan = planStart({
      target,
      sameDay: [target],
      sections,
      running: null,
      now,
      nowClock: "12:30",
      isToday: true,
    });
    expect(plan.relocations).toEqual([{ taskId: 1, sectionId: afternoon.id, sortOrder: 1000 }]);
    expect(plan.interruption).toBeNull();
  });

  it("今日でなければ規則a を当てない（画面定義書01 §4.2 の対象日）", () => {
    const target = task({ id: 1, sectionId: forenoon.id });
    const plan = planStart({
      target,
      sameDay: [target],
      sections,
      running: null,
      now,
      nowClock: "12:30",
      isToday: false,
    });
    expect(plan.relocations).toEqual([]);
  });

  it("割り込みの再開タスクは、規則a で**移動した後の**開始タスクの直下に置く（画面定義書01 §4.2-a）", () => {
    const running = task({ id: 9, sectionId: forenoon.id, startedAt: atJst("09:00"), estimateMinutes: 60 });
    const target = task({ id: 1, sectionId: forenoon.id, sortOrder: 2000 });
    const afternoonTask = task({ id: 3, sectionId: afternoon.id, sortOrder: 5000 });
    const plan = planStart({
      target,
      sameDay: [running, target, afternoonTask],
      sections,
      running,
      now,
      nowClock: "12:30",
      isToday: true,
    });
    // 開始タスクは午後セクションの未実行タスクより前へ移り、再開タスクはその直下（未実行タスクとのあいだ）に入る
    const moved = plan.relocations.find((r) => r.taskId === 1)!;
    expect(moved.sectionId).toBe(afternoon.id);
    expect(plan.interruption).toMatchObject({
      runningTaskId: 9,
      endedAt: now,
      resume: { sectionId: afternoon.id, draft: { name: "T9（再開）", splitParentId: 9 } },
    });
    const resumeOrder = plan.interruption!.resume.sortOrder;
    expect(resumeOrder).toBeGreaterThan(moved.sortOrder);
    expect(resumeOrder).toBeLessThan(afternoonTask.sortOrder);
  });
});

describe("planSuspend（画面定義書01 O-4 / データモデル定義書 §4.2-a）", () => {
  it("再開タスクを元タスクの直後に、元タスクと同じセクションで置く", () => {
    const target = task({ id: 1, sectionId: forenoon.id, startedAt: atJst("09:00"), sortOrder: 1000 });
    const next = task({ id: 2, sectionId: forenoon.id, sortOrder: 2000 });
    const plan = planSuspend(target, [target, next], atJst("09:20"));
    expect(plan.resume).toMatchObject({
      sectionId: forenoon.id,
      sortOrder: 1500,
      draft: { name: "T1（再開）", splitParentId: 1 },
    });
  });
});

describe("planDuplicate（画面定義書01 O-11）", () => {
  it("複製元の直下に、複製元と同じセクションで置く（繰り下げは規則b が後から当たる）", () => {
    const target = task({ id: 1, sectionId: forenoon.id, sortOrder: 1000, name: "読む" });
    const next = task({ id: 2, sectionId: forenoon.id, sortOrder: 2000 });
    const plan = planDuplicate(target, [target, next]);
    expect(plan.duplicate).toMatchObject({
      sectionId: forenoon.id,
      sortOrder: 1500,
      draft: { name: "読む" },
    });
  });
});

describe("planDuplicateAndStart（画面定義書01 O-14 / データモデル定義書 §4.6）", () => {
  const completed = task({
    id: 1,
    sectionId: forenoon.id,
    startedAt: atJst("09:00"),
    endedAt: atJst("09:30"),
  });

  it("今日なら現在時刻を含むセクションへ、開始時刻順の位置で置く", () => {
    const later = task({ id: 2, sectionId: afternoon.id, sortOrder: 2000 });
    const plan = planDuplicateAndStart({
      target: completed,
      sameDay: [completed, later],
      sections,
      running: null,
      now: atJst("12:30"),
      nowClock: "12:30",
      isToday: true,
    });
    expect(plan.duplicate.sectionId).toBe(afternoon.id);
    expect(plan.duplicate.sortOrder).toBeLessThan(later.sortOrder); // 未実行より前
    expect(plan.interruption).toBeNull();
  });

  it("今日でなければ複製元と同じセクションに置く", () => {
    const plan = planDuplicateAndStart({
      target: completed,
      sameDay: [completed],
      sections,
      running: null,
      now: atJst("12:30"),
      nowClock: "12:30",
      isToday: false,
    });
    expect(plan.duplicate.sectionId).toBe(forenoon.id);
  });

  it("割り込みでは再開タスクを複製行の直下に置き、2行の採番を一度に決める（データモデル定義書 §3.5 の例外）", () => {
    const running = task({ id: 9, sectionId: afternoon.id, startedAt: atJst("12:00"), sortOrder: 1000 });
    const plan = planDuplicateAndStart({
      target: completed,
      sameDay: [completed, running],
      sections,
      running,
      now: atJst("12:30"),
      nowClock: "12:30",
      isToday: true,
    });
    expect(plan.interruption).toMatchObject({ runningTaskId: 9, resume: { sectionId: afternoon.id } });
    expect(plan.duplicate.sortOrder).toBeGreaterThan(running.sortOrder);
    expect(plan.interruption!.resume.sortOrder).toBeGreaterThan(plan.duplicate.sortOrder);
  });
});

describe("planUndoPunch（画面定義書01 O-13 / O-15）", () => {
  it("今日でなければ並べ直さない", () => {
    const target = task({ id: 1, sectionId: forenoon.id, startedAt: atJst("09:00") });
    expect(planUndoPunch(target, [target], sections, "12:30", false)).toEqual([]);
  });

  it("今日なら現在位置（現在時刻を含むセクションの未実行先頭）へ置き直す", () => {
    const target = task({ id: 1, sectionId: forenoon.id, startedAt: atJst("09:00") });
    expect(planUndoPunch(target, [target], sections, "12:30", true)).toEqual([
      { taskId: 1, sectionId: afternoon.id, sortOrder: 1000 },
    ]);
  });
});

describe("planPunchEdit（画面定義書01 §4.2-c）", () => {
  const target = task({ id: 1, sectionId: forenoon.id, startedAt: atJst("09:00") });

  it("開始時刻が変わったら修正後の時刻のセクションへ移す", () => {
    expect(planPunchEdit(target, [target], sections, atJst("12:10"), "12:10")).toEqual([
      { taskId: 1, sectionId: afternoon.id, sortOrder: 1000 },
    ]);
  });

  it("開始時刻が変わらない（終了時刻だけの修正）なら移さない", () => {
    expect(planPunchEdit(target, [target], sections, atJst("09:00"), "09:00")).toEqual([]);
  });

  it("未打刻のタスクに開始時刻を入れたときも移す（画面定義書01 §3.3 ④）", () => {
    const notStarted = task({ id: 1, sectionId: forenoon.id });
    expect(planPunchEdit(notStarted, [notStarted], sections, atJst("12:10"), "12:10")).toEqual([
      { taskId: 1, sectionId: afternoon.id, sortOrder: 1000 },
    ]);
  });
});
