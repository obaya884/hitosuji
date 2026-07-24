import { describe, expect, it } from "vitest";
import { currentTaskId, keepSelection, moveSelection, selectionAfterFinish } from "./selection";
import type { Task } from "./task";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 30,
    sectionId: 1,
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

const startedAt = new Date("2026-07-19T08:00:00Z");
const endedAt = new Date("2026-07-19T08:30:00Z");

describe("currentTaskId（画面定義書01 §5: 現在地の規則）", () => {
  it("実行中タスクがあればそれを指す", () => {
    const tasks = [task({ id: 1, startedAt, endedAt }), task({ id: 2, startedAt }), task({ id: 3 })];
    expect(currentTaskId(tasks)).toBe(2);
  });

  it("実行中がなければ表示順で最初の未実行タスク", () => {
    const tasks = [task({ id: 1, startedAt, endedAt }), task({ id: 2 }), task({ id: 3 })];
    expect(currentTaskId(tasks)).toBe(2);
  });

  it("すべて完了なら現在地はない", () => {
    const tasks = [task({ id: 1, startedAt, endedAt })];
    expect(currentTaskId(tasks)).toBeNull();
  });

  it("タスクが0件なら現在地はない", () => {
    expect(currentTaskId([])).toBeNull();
  });
});

describe("moveSelection（画面定義書01 §6: J/K・↑↓ で選択移動）", () => {
  const tasks = [task({ id: 1 }), task({ id: 2 }), task({ id: 3 })];

  it("下へ1つ移動する", () => {
    expect(moveSelection(tasks, 1, 1)).toBe(2);
  });

  it("上へ1つ移動する", () => {
    expect(moveSelection(tasks, 3, -1)).toBe(2);
  });

  it("末尾で下へ移動しても止まる", () => {
    expect(moveSelection(tasks, 3, 1)).toBe(3);
  });

  it("先頭で上へ移動しても止まる", () => {
    expect(moveSelection(tasks, 1, -1)).toBe(1);
  });

  it("未選択から下へ移動すると先頭を選ぶ", () => {
    expect(moveSelection(tasks, null, 1)).toBe(1);
  });

  it("未選択から上へ移動すると末尾を選ぶ", () => {
    expect(moveSelection(tasks, null, -1)).toBe(3);
  });

  it("タスクが0件なら選択なし", () => {
    expect(moveSelection([], 1, 1)).toBeNull();
  });

  it("選択IDが一覧に存在しない場合は先頭へフォールバックする", () => {
    expect(moveSelection(tasks, 999, 1)).toBe(1);
  });
});

describe("selectionAfterFinish（画面定義書01 §5 / F-211: 終了打刻後は選択を次の未実行へ送る）", () => {
  it("呼び出し時点のスナップショットに残る実行中タスク（終了対象）を飛ばして最初の未実行を選ぶ", () => {
    // 実運用では daily-board が楽観的更新の適用前スナップショットを渡すため、いま終了打刻した
    // タスク（id=2）はまだ実行中として含まれる。currentTaskId（実行中を優先）と違い、実行中を
    // 無視して未実行を選ぶことを固定する（無視しないと終了したばかりの行を選び直してしまう）
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2, startedAt }), // = いま終了打刻した対象（スナップショットではまだ実行中）
      task({ id: 3 }),
      task({ id: 4 }),
    ];
    expect(selectionAfterFinish(tasks)).toBe(3);
  });

  it("未実行の後ろに完了が来る入り組んだ並びでも、リスト順で最初の未実行を選ぶ", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2 }), // 最初の未実行
      task({ id: 3, startedAt, endedAt }),
      task({ id: 4 }),
    ];
    expect(selectionAfterFinish(tasks)).toBe(2);
  });

  it("未実行が1件だけならそれを選ぶ", () => {
    expect(selectionAfterFinish([task({ id: 1 })])).toBe(1);
  });

  it("送り先の未実行タスクがなければ null（呼び出し側は完了行に据え置く）", () => {
    const tasks = [task({ id: 1, startedAt, endedAt }), task({ id: 2, startedAt, endedAt })];
    expect(selectionAfterFinish(tasks)).toBeNull();
  });

  it("タスクが0件なら null", () => {
    expect(selectionAfterFinish([])).toBeNull();
  });
});

describe("keepSelection（削除・日付移動の後も選択を保つ）", () => {
  it("選択中のタスクが残っていればそのまま", () => {
    const tasks = [task({ id: 1 }), task({ id: 2 })];
    expect(keepSelection(tasks, 2)).toBe(2);
  });

  it("選択中のタスクが消えたら現在地へ戻す", () => {
    const tasks = [task({ id: 1, startedAt }), task({ id: 3 })];
    expect(keepSelection(tasks, 99)).toBe(1);
  });

  it("未選択なら現在地を選ぶ", () => {
    const tasks = [task({ id: 1, startedAt, endedAt }), task({ id: 2 })];
    expect(keepSelection(tasks, null)).toBe(2);
  });
});
