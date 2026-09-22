import { describe, expect, it } from "vitest";
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import type { ProjectRepository } from "@/usecases/ports/project-repository";
import { inMemoryTaskRepository } from "@/usecases/task/testing/in-memory-repository";
import type { Mode } from "@/domain/mode/mode";
import type { Task } from "@/domain/task/task";
import { COLOR_PRESETS } from "@/domain/shared/color-presets";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { listDailyReview } from "./review-usecases";

const modes: Mode[] = [
  { id: 10, name: "仕事", color: COLOR_PRESETS[8].value, isArchived: false },
  { id: 20, name: "旧枠", color: COLOR_PRESETS[12].value, isArchived: true },
];

const modeRepo: ModeRepository = {
  listAll: async () => [...modes],
  create: async () => modes[0],
  update: async () => {},
  setArchived: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};
const projectRepo: ProjectRepository = {
  listAll: async () => [],
  create: async () => ({ id: 1, name: "", isArchived: false }),
  update: async () => {},
  setArchived: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};

function depsOf(tasks: readonly Task[]) {
  return { tasks: inMemoryTaskRepository(tasks), modes: modeRepo, projects: projectRepo };
}

const done = {
  id: 1,
  modeId: 10,
  startedAt: atJst("08:00"),
  endedAt: atJst("09:00"),
};

describe("listDailyReview（画面定義書04 §3: 指定日の振り返り）", () => {
  it("表示日のタスクだけを対象にする", async () => {
    const view = await listDailyReview(
      depsOf([
        task(done),
        task({ id: 2, taskDate: "2026-07-25", startedAt: atJst("08:00", "2026-07-25") }),
      ]),
      { date: TEST_DATE, today: "2026-07-27" }
    );
    expect(view.log.map((t) => t.id)).toEqual([1]);
  });

  it("実績合計とモード別・プロジェクト別の集計を返す（F-503 / §3.5）", async () => {
    const view = await listDailyReview(
      depsOf([
        task(done),
        task({
          id: 2,
          projectId: 30,
          startedAt: atJst("09:00"),
          endedAt: atJst("09:30"),
        }),
      ]),
      { date: TEST_DATE, today: "2026-07-27" }
    );
    expect(view.totalMinutes).toBe(90);
    expect(view.modeTotals).toEqual([
      { key: 10, minutes: 60 },
      { key: null, minutes: 30 },
    ]);
    expect(view.projectTotals).toEqual([
      { key: 30, minutes: 30 },
      { key: null, minutes: 60 },
    ]);
  });

  it("過去日では未実行タスクを先送りとして返す（F-502 / §3.4）", async () => {
    const view = await listDailyReview(depsOf([task(done), task({ id: 2 })]), {
      date: TEST_DATE,
      today: "2026-07-27",
    });
    expect(view.postponed?.map((t) => t.id)).toEqual([2]);
    // 同じ未実行タスクが実績ログには出ないこと（§3.3。絞り込み関数を差し替えても検出できるよう
    // 型任せにせず値でも主張する）
    expect(view.log.map((t) => t.id)).toEqual([1]);
  });

  it("過去日では、その日に生まれて後日へ持ち越されたタスクも先送りとして返す（§3.4 ①）", async () => {
    const carried = task({
      id: 3,
      taskDate: "2026-07-27",
      initialTaskDate: TEST_DATE,
      startedAt: atJst("09:00", "2026-07-27"),
      endedAt: atJst("09:30", "2026-07-27"),
    });
    const view = await listDailyReview(depsOf([task(done), task({ id: 2 }), carried]), {
      date: TEST_DATE,
      today: "2026-07-28",
    });
    // 持ち越し（①）が先、残っている未実行（②）が後
    expect(view.postponed?.map((t) => t.id)).toEqual([3, 2]);
    // 持ち越し先で実行済みでも、表示日の実績ログには出ない（別の日の実績。§3.3）
    expect(view.log.map((t) => t.id)).toEqual([1]);
  });

  // 境界は「今日」（`date < today` の等号側）。未来日は境界の外側で、同じ比較の同じ枝を通る
  it("今日は先送り数を出さない（まだ実行されうるため。§3.4）", async () => {
    const view = await listDailyReview(depsOf([task({ id: 2 })]), {
      date: TEST_DATE,
      today: TEST_DATE,
    });
    expect(view.postponed).toBeNull();
  });

  it("アーカイブ済みマスタも返す（過去タスクから参照されるため。§3.5）", async () => {
    const view = await listDailyReview(depsOf([task(done)]), {
      date: TEST_DATE,
      today: "2026-07-27",
    });
    expect(view.modes.map((m) => m.id)).toEqual([10, 20]);
  });
});
