import { describe, expect, it } from "vitest";
import type { Section } from "@/domain/section/section";
import type { Task } from "@/domain/task/task";
import { TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { inMemorySectionRepository } from "@/usecases/section/testing/in-memory-repository";
import { applyCarryOver, applyCarryOverAfterPunch } from "./relocation-usecases";
import { inMemoryTaskRepository } from "./testing/in-memory-repository";

const sections: Section[] = [
  { id: 1, name: "朝", startTime: "06:00", isArchived: false },
  { id: 2, name: "午前", startTime: "09:00", isArchived: false },
];

const today = TEST_DATE;

function depsOf(rows: readonly Task[]) {
  const tasks = inMemoryTaskRepository(rows);
  return { deps: { tasks, sections: inMemorySectionRepository(sections) }, tasks };
}

describe("applyCarryOver（F-113 / 画面定義書01 §4.2-b）", () => {
  it("過ぎたセクションに残る未実行タスクを、現在セクションへ繰り下げる", async () => {
    const { deps, tasks } = depsOf([
      task({ id: 1, sectionId: 1 }), // 朝のやり残し
      task({ id: 2, sectionId: 2 }), // 元々午前にある
    ]);

    await applyCarryOver(deps, { date: today, today, nowClock: "10:00" });

    const moved = tasks.rows.find((t) => t.id === 1);
    expect(moved?.sectionId).toBe(2);
    // 移動先では元からあるタスクより前に置く（§4.2-b）
    expect(moved!.sortOrder).toBeLessThan(tasks.rows.find((t) => t.id === 2)!.sortOrder);
  });

  it("過去日・未来日では何もしない（§4.2 の対象外）", async () => {
    const { deps, tasks } = depsOf([task({ id: 1, taskDate: "2026-07-25", sectionId: 1 })]);

    await applyCarryOver(deps, { date: "2026-07-25", today, nowClock: "10:00" });

    expect(tasks.rows[0].sectionId).toBe(1);
  });

  it("繰り返し呼んでも結果が変わらない（表示のたびに走るため冪等であること）", async () => {
    const { deps, tasks } = depsOf([task({ id: 1, sectionId: 1 }), task({ id: 2, sectionId: 2 })]);

    await applyCarryOver(deps, { date: today, today, nowClock: "10:00" });
    const first = tasks.rows.map((t) => ({ id: t.id, sectionId: t.sectionId, sortOrder: t.sortOrder }));

    await applyCarryOver(deps, { date: today, today, nowClock: "10:00" });
    const second = tasks.rows.map((t) => ({ id: t.id, sectionId: t.sectionId, sortOrder: t.sortOrder }));

    expect(second).toEqual(first);
  });

  it("未分類（インボックス）のタスクは繰り下げない（§4.2 の対象外）", async () => {
    const { deps, tasks } = depsOf([task({ id: 1, sectionId: null })]);

    await applyCarryOver(deps, { date: today, today, nowClock: "10:00" });

    expect(tasks.rows[0].sectionId).toBeNull();
  });
});

describe("applyCarryOverAfterPunch（画面定義書01 §4.2「移動に失敗したとき」: 打刻は成立させる）", () => {
  it("移動が失敗しても reject せず、打刻フローを止めない（冪等なので後で再試行される）", async () => {
    // 繰り下げ対象がある状態で relocate だけが失敗するリポジトリ
    const base = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1 }), // 朝のやり残し → 繰り下げ対象
      task({ id: 2, sectionId: 2 }),
    ]);
    const failingTasks = {
      ...base,
      relocate: async () => {
        throw new Error("relocate failed");
      },
    };
    const deps = { tasks: failingTasks, sections: inMemorySectionRepository(sections) };

    // 直接 applyCarryOver ならこの状況で失敗するが、After 版は握りつぶす
    await expect(applyCarryOver(deps, { date: today, today, nowClock: "10:00" })).rejects.toThrow();
    await expect(
      applyCarryOverAfterPunch(deps, { date: today, today, nowClock: "10:00" })
    ).resolves.toBeUndefined();
  });
});
