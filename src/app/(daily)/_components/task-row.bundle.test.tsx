import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { bundleOf, bundleColorOf, MODES, PROJECTS, SECTIONS } from "../_testing/factories";
import { cellsOf, taskRow } from "../_testing/table-helpers";
import { TaskRow, type TaskRowProps } from "./task-row";

/**
 * props は `TaskRowProps` から派生させる（同じ形を手で写さない）。**`task` だけ必須**——
 * どのテストも自分が描く行に依拠するので既定値を持たせない（テスト戦略定義書 §4）。
 * バンドルの道だけを見るテストなので `task-row.test.tsx` とは別ファイルに分ける（brief 指定）
 */
type Overrides = Partial<Omit<TaskRowProps, "task">> & Pick<TaskRowProps, "task">;

function renderRow(overrides: Overrides) {
  render(
    <table>
      <tbody>
        <TaskRow
          task={overrides.task}
          bundle={overrides.bundle ?? null}
          index={overrides.index ?? 0}
          sectionId={overrides.sectionId ?? null}
          mode={overrides.mode}
          project={overrides.project}
          modes={overrides.modes ?? MODES}
          projects={overrides.projects ?? PROJECTS}
          sections={overrides.sections ?? SECTIONS}
          sectionOptions={overrides.sectionOptions ?? []}
          isSelected={overrides.isSelected ?? false}
          editing={overrides.editing ?? null}
          now={overrides.now ?? atJst("10:00")}
          projectedStart={overrides.projectedStart ?? null}
          isFutureDate={overrides.isFutureDate ?? false}
          stickyHeight={overrides.stickyHeight ?? 0}
          onRename={vi.fn()}
          onEstimate={vi.fn()}
          onPunch={vi.fn()}
          onEditPunch={vi.fn()}
          onAssign={vi.fn()}
          onOperate={vi.fn()}
          onToggleHighlight={vi.fn()}
          onRoutinize={vi.fn().mockReturnValue(true)}
          onSelect={vi.fn()}
          onBeginEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      </tbody>
    </table>
  );
}

// jsdom は scrollIntoView を実装しないため、選択行を描くテストが副作用で落ちないよう詰める
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("バンドルの道（画面定義書01 §3.3 / F-119）", () => {
  const morningBundle = bundleOf("朝の立上げ");

  it("バンドルに属する行の最左端に、バンドル色の縦帯を出す", () => {
    renderRow({ task: task({ id: 1, name: "ラジオ体操", bundleId: 5 }), bundle: morningBundle });

    const road = screen.getByTestId("bundle-road");
    expect(road.style.backgroundColor).toBe(bundleColorOf("朝の立上げ"));
  });

  it("バンドルに属さない行には帯を出さない", () => {
    renderRow({ task: task({ id: 1, name: "単発タスク", bundleId: null }), bundle: null });

    expect(screen.queryByTestId("bundle-road")).toBeNull();
  });

  // 隣接（前後の行）は見ずに、各行が独立に自分の所属だけを見て描く（brief の曖昧さ解決2）。
  // 単独行のレンダリングでも帯が出ることが、その独立性の検査になる
  it("前後に同じバンドルが無くても帯を出す（孤立メンバー）", () => {
    renderRow({ task: task({ id: 1, name: "孤立メンバー", bundleId: 5 }), bundle: morningBundle });

    expect(screen.getByTestId("bundle-road")).not.toBeNull();
  });

  it("完了行にも帯を出す（状態を問わない）", () => {
    renderRow({
      task: task({
        id: 1,
        name: "完了タスク",
        bundleId: 5,
        startedAt: atJst("06:00"),
        endedAt: atJst("06:10"),
      }),
      bundle: morningBundle,
    });

    expect(screen.getByTestId("bundle-road")).not.toBeNull();
  });

  it("未来日にも帯を出す（日付を問わない）", () => {
    renderRow({
      task: task({ id: 1, name: "未来のタスク", bundleId: 5 }),
      bundle: morningBundle,
      isFutureDate: true,
    });

    expect(screen.getByTestId("bundle-road")).not.toBeNull();
  });

  it("帯にバンドル名を持たせる（ホバーと読み上げに同じ名前を出す）", () => {
    renderRow({ task: task({ id: 1, name: "ラジオ体操", bundleId: 5 }), bundle: morningBundle });

    // aria-label がそのまま読み上げ名になる（span に role は持たせていないため title と同じ値で見る）
    const road = screen.getByTestId("bundle-road");
    expect(road.getAttribute("aria-label")).toBe("朝の立上げ");
    expect(road.getAttribute("title")).toBe("朝の立上げ");
  });

  it("帯は打刻ボタンより外側（最左端の専用列）に置く", () => {
    renderRow({ task: task({ id: 1, name: "ラジオ体操", bundleId: 5 }), bundle: morningBundle });

    const { road, punch } = cellsOf(taskRow("ラジオ体操"));
    expect(within(road).getByTestId("bundle-road")).not.toBeNull();
    // 列位置として道が打刻ボタンより先（DOM順で前）にあること
    expect(road.compareDocumentPosition(punch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
