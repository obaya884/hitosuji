import { describe, expect, it } from "vitest";
import type { Section } from "../section/section";
import {
  groupTasksBySection,
  totalEstimateMinutes,
  withTaskAppended,
  withTaskMoved,
} from "./daily-list";
import type { Task } from "./task";

const morning: Section = { id: 1, name: "朝", startTime: "06:00", isArchived: false };
const forenoon: Section = { id: 2, name: "午前", startTime: "09:00", isArchived: false };
const archived: Section = { id: 3, name: "旧枠", startTime: "15:00", isArchived: true };

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

describe("groupTasksBySection（画面定義書01 §3.2: 表示順はセクション→sort_order）", () => {
  it("未分類グループをリスト先頭に置く（インボックス）", () => {
    const groups = groupTasksBySection(
      [task({ id: 1, sectionId: morning.id }), task({ id: 2, sectionId: null })],
      [morning]
    );
    expect(groups.map((g) => g.section?.name ?? "未分類")).toEqual(["未分類", "朝"]);
  });

  it("未分類が0件なら未分類グループを表示しない", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: morning.id })], [morning]);
    expect(groups.map((g) => g.section?.name)).toEqual(["朝"]);
  });

  it("セクションは start_time 昇順に並ぶ", () => {
    const groups = groupTasksBySection(
      [task({ id: 1, sectionId: forenoon.id }), task({ id: 2, sectionId: morning.id })],
      [forenoon, morning]
    );
    expect(groups.map((g) => g.section?.name)).toEqual(["朝", "午前"]);
  });

  it("グループ内は sort_order 昇順に並ぶ", () => {
    const groups = groupTasksBySection(
      [
        task({ id: 1, sectionId: morning.id, sortOrder: 3000 }),
        task({ id: 2, sectionId: morning.id, sortOrder: 1000 }),
      ],
      [morning]
    );
    expect(groups[0].tasks.map((t) => t.id)).toEqual([2, 1]);
  });

  it("タスクが属さないセクションは見出しを出さない", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: morning.id })], [morning, forenoon]);
    expect(groups).toHaveLength(1);
  });

  it("アーカイブ済みセクションでも当日タスクが属していれば表示する（枠は導出しない）", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: archived.id })], [morning, archived]);
    expect(groups.map((g) => [g.section?.name, g.endTime])).toEqual([["旧枠", null]]);
  });

  it("有効セクションの枠の終了時刻は次のセクションの開始時刻になる", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: morning.id })], [morning, forenoon]);
    expect(groups[0].endTime).toBe("09:00");
  });

  it("タスク0件の日は空配列（空状態の表示は presentation の責務。§7）", () => {
    expect(groupTasksBySection([], [morning, forenoon])).toEqual([]);
  });
});

describe("totalEstimateMinutes（F-110: セクション見積合計）", () => {
  it("見積もりを合計する（未設定=0分はそのまま加算されない）", () => {
    const tasks = [task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 0 })];
    expect(totalEstimateMinutes(tasks)).toBe(30);
  });
});

describe("withTaskAppended（N-01: 楽観的更新で追加を即反映）", () => {
  it("未分類グループがなければ先頭に作る", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: morning.id })], [morning]);
    const appended = withTaskAppended(groups, task({ id: 9 }));
    expect(appended.map((g) => g.section?.name ?? "未分類")).toEqual(["未分類", "朝"]);
    expect(appended[0].tasks.map((t) => t.id)).toEqual([9]);
  });

  it("既存の未分類グループの末尾へ足す", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: null })], [morning]);
    const appended = withTaskAppended(groups, task({ id: 9 }));
    expect(appended[0].tasks.map((t) => t.id)).toEqual([1, 9]);
  });

  it("元のグループ列を変更しない", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: null })], [morning]);
    withTaskAppended(groups, task({ id: 9 }));
    expect(groups[0].tasks).toHaveLength(1);
  });
});

describe("withTaskMoved（N-01: 並び替えを即反映）", () => {
  const groups = groupTasksBySection(
    [
      task({ id: 1, sectionId: morning.id, sortOrder: 1000 }),
      task({ id: 2, sectionId: morning.id, sortOrder: 2000 }),
      task({ id: 3, sectionId: forenoon.id, sortOrder: 1000 }),
    ],
    [morning, forenoon]
  );

  it("同じグループ内で位置を入れ替える", () => {
    const moved = withTaskMoved(groups, 2, { sectionId: morning.id, index: 0 });
    expect(moved[0].tasks.map((t) => t.id)).toEqual([2, 1]);
  });

  it("別のセクションへ移すと section_id も変わる", () => {
    const moved = withTaskMoved(groups, 1, { sectionId: forenoon.id, index: 0 });
    expect(moved[0].tasks.map((t) => t.id)).toEqual([2]);
    expect(moved[1].tasks.map((t) => t.id)).toEqual([1, 3]);
    expect(moved[1].tasks[0].sectionId).toBe(forenoon.id);
  });

  it("元のグループ列を変更しない", () => {
    withTaskMoved(groups, 2, { sectionId: morning.id, index: 0 });
    expect(groups[0].tasks.map((t) => t.id)).toEqual([1, 2]);
  });
});
