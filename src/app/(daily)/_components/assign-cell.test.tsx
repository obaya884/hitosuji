import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { checkedPopoverLabels, popoverLabels } from "../_testing/table-helpers";
import { AssignCell, type AssignCellProps } from "./assign-cell";

const OPTIONS = [
  { id: null, label: "モードなし" },
  { id: 1, label: "仕事" },
  { id: 2, label: "生活" },
];

/** props は `AssignCellProps` から派生させる（同じ形を手で写さない） */
function renderCell(overrides: Partial<AssignCellProps> = {}) {
  const result = render(
    <table>
      <tbody>
        <tr>
          <AssignCell
            label={overrides.label ?? "モード"}
            name={overrides.name}
            options={overrides.options ?? OPTIONS}
            selectedId={overrides.selectedId ?? null}
            isDimmed={overrides.isDimmed ?? false}
            isEditing={overrides.isEditing ?? false}
            onOpen={overrides.onOpen ?? vi.fn()}
            onSelect={overrides.onSelect ?? vi.fn()}
            onClose={overrides.onClose ?? vi.fn()}
          />
        </tr>
      </tbody>
    </table>
  );
  return { ...result, cell: result.container.querySelector("td") as HTMLElement };
}

// プロジェクト列・モード列が共有するセル（§3.3「プロジェクト列・モード列の共通規則」）。
// 2列への配線（label・列位置・どの id を現在値として渡すか）は task-row.test.tsx、
// 名前の解決（modeId → Mode）は daily-list.test.tsx が見る
describe("AssignCell（画面定義書01 §3.3 / O-5: 割り当ての入口になるセル）", () => {
  it("未設定は薄色の `-`（00_共通 §2.4: 空欄にしない）", () => {
    const { cell } = renderCell();

    const button = within(cell).getByRole("button");
    // 空欄にしない（クリックして設定できることが伝わらないため）
    expect(button.textContent).toBe("-");
    expect((button.firstElementChild as HTMLElement).classList.contains("text-ink-faint")).toBe(true);
  });

  // `isDimmed` は「副次情報の色にするか」の真偽だけを受け取り、クラスの決定はここが持つ。
  // どの行の・どのセルを対象にするかは §3.3「モード未設定行の色」で、配線は task-row.test.tsx
  it("指定があればセル全体を副次情報の色（text-ink-muted）にする", () => {
    const { cell } = renderCell({ isDimmed: true });

    expect(cell.classList.contains("text-ink-muted")).toBe(true);
  });

  it("指定がなければ色のクラスを付けない（行の色をそのまま効かせる）", () => {
    const { cell } = renderCell();

    expect(cell.classList.contains("text-ink-muted")).toBe(false);
  });

  it("割り当て済みは名前を出し、aria-label にも載せる", () => {
    renderCell({ label: "プロジェクト", name: "サイト改善" });

    expect(screen.getByLabelText("プロジェクト（サイト改善）").textContent).toBe("サイト改善");
  });

  it("編集中は候補を出し、現在値にチェックを付ける（O-5 / F-112）", () => {
    renderCell({ name: "生活", selectedId: 2, isEditing: true });

    expect(popoverLabels()).toEqual(["モードなし", "仕事", "生活"]);
    // 現在値（selectedId）だけにチェックが付く。渡す id を取り違えると別の候補に付く
    expect(checkedPopoverLabels()).toEqual(["生活"]);
  });

  it("編集中でなければ候補を出さない", () => {
    renderCell({ name: "生活", selectedId: 2 });

    expect(popoverLabels()).toEqual([]);
  });
});
