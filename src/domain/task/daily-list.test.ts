import { describe, expect, it } from "vitest";
import type { Section } from "../section/section";
import {
  groupTasksBySection,
  sectionTotalMinutes,
  taskProgress,
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

  it("未分類は0件でも常に表示する（受け皿として見えている必要がある）", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: morning.id })], [morning]);
    expect(groups.map((g) => g.section?.name ?? "未分類")).toEqual(["未分類", "朝"]);
    expect(groups[0].tasks).toEqual([]);
  });

  it("セクションは start_time 昇順に並ぶ", () => {
    const groups = groupTasksBySection(
      [task({ id: 1, sectionId: forenoon.id }), task({ id: 2, sectionId: morning.id })],
      [forenoon, morning]
    );
    expect(groups.map((g) => g.section?.name)).toEqual([undefined, "朝", "午前"]);
  });

  it("グループ内は sort_order 昇順に並ぶ", () => {
    const groups = groupTasksBySection(
      [
        task({ id: 1, sectionId: morning.id, sortOrder: 3000 }),
        task({ id: 2, sectionId: morning.id, sortOrder: 1000 }),
      ],
      [morning]
    );
    expect(groups[1].tasks.map((t) => t.id)).toEqual([2, 1]);
  });

  it("有効セクションはタスク0件でも表示する（1日の枠組みを俯瞰するため）", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: morning.id })], [morning, forenoon]);
    expect(groups.map((g) => g.section?.name ?? "未分類")).toEqual(["未分類", "朝", "午前"]);
    expect(groups[2].tasks).toEqual([]);
  });

  it("アーカイブ済みセクションはタスクが属している場合のみ表示する（枠は導出しない）", () => {
    const withTask = groupTasksBySection([task({ id: 1, sectionId: archived.id })], [morning, archived]);
    expect(withTask.map((g) => [g.section?.name, g.endTime])).toEqual([
      [undefined, null],
      ["朝", "06:00"],
      ["旧枠", null],
    ]);

    const withoutTask = groupTasksBySection([], [morning, archived]);
    expect(withoutTask.map((g) => g.section?.name ?? "未分類")).toEqual(["未分類", "朝"]);
  });

  it("有効セクションの枠の終了時刻は次のセクションの開始時刻になる", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: morning.id })], [morning, forenoon]);
    expect(groups[1].endTime).toBe("09:00");
  });

  it("タスク0件の日でもセクション見出しは並ぶ", () => {
    const groups = groupTasksBySection([], [morning, forenoon]);
    expect(groups.map((g) => g.section?.name ?? "未分類")).toEqual(["未分類", "朝", "午前"]);
    expect(groups.every((g) => g.tasks.length === 0)).toBe(true);
  });
});

describe("sectionTotalMinutes（F-110: セクション時間合計。完了は実績・未完了は見積もり）", () => {
  it("未完了は見積もりを合計する（未設定=0分はそのまま加算されない）", () => {
    const tasks = [task({ id: 1, estimateMinutes: 30 }), task({ id: 2, estimateMinutes: 0 })];
    expect(sectionTotalMinutes(tasks)).toBe(30);
  });

  it("完了タスクは見積もりでなく実績で数える", () => {
    const tasks = [
      // 見積もり30分だが実績は18分（08:30-08:48）
      task({
        id: 1,
        estimateMinutes: 30,
        startedAt: new Date("2026-07-19T08:30:00+09:00"),
        endedAt: new Date("2026-07-19T08:48:00+09:00"),
      }),
      task({ id: 2, estimateMinutes: 45 }), // 未実行 → 見積もり
    ];
    expect(sectionTotalMinutes(tasks)).toBe(18 + 45);
  });

  it("実行中タスクは見積もりで数える（完了打刻まで実績に切り替わらない）", () => {
    const tasks = [
      task({ id: 1, estimateMinutes: 30, startedAt: new Date("2026-07-19T09:00:00+09:00") }),
    ];
    expect(sectionTotalMinutes(tasks)).toBe(30);
  });
});

describe("taskProgress（F-114: タスク進捗。セクション見出し §3.2 と1日全体のサマリ §3.1 で共用）", () => {
  it("実施済み＝完了（ended_at あり）で数え、実行中は含めない", () => {
    const tasks = [
      task({
        id: 1,
        startedAt: new Date("2026-07-20T09:00:00+09:00"),
        endedAt: new Date("2026-07-20T09:10:00+09:00"),
      }),
      task({ id: 2, startedAt: new Date("2026-07-20T09:10:00+09:00"), endedAt: null }), // 実行中
      task({ id: 3 }), // 未実行
    ];
    expect(taskProgress(tasks)).toEqual({ done: 1, total: 3 });
  });

  it("0件のグループは 0/0", () => {
    expect(taskProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("withTaskAppended（N-01: 楽観的更新で追加を即反映）", () => {
  it("空の未分類グループへ足す", () => {
    const groups = groupTasksBySection([task({ id: 1, sectionId: morning.id })], [morning]);
    const appended = withTaskAppended(groups, task({ id: 9 }));
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

  // groups[0] は未分類、groups[1] が朝、groups[2] が午前
  it("同じグループ内で位置を入れ替える", () => {
    const moved = withTaskMoved(groups, 2, { sectionId: morning.id, index: 0 });
    expect(moved[1].tasks.map((t) => t.id)).toEqual([2, 1]);
  });

  it("別のセクションへ移すと section_id も変わる", () => {
    const moved = withTaskMoved(groups, 1, { sectionId: forenoon.id, index: 0 });
    expect(moved[1].tasks.map((t) => t.id)).toEqual([2]);
    expect(moved[2].tasks.map((t) => t.id)).toEqual([1, 3]);
    expect(moved[2].tasks[0].sectionId).toBe(forenoon.id);
  });

  it("空のセクションへも移せる（0件でも見出しが表示されているため）", () => {
    const moved = withTaskMoved(groups, 1, { sectionId: null, index: 0 });
    expect(moved[0].tasks.map((t) => t.id)).toEqual([1]);
    expect(moved[0].tasks[0].sectionId).toBeNull();
  });

  it("元のグループ列を変更しない", () => {
    withTaskMoved(groups, 2, { sectionId: morning.id, index: 0 });
    expect(groups[1].tasks.map((t) => t.id)).toEqual([1, 2]);
  });
});
