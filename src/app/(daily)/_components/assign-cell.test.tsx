import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssignCell, type AssignCellProps } from "./assign-cell";

function renderCell(overrides: Partial<AssignCellProps> = {}) {
  return render(
    <table>
      <tbody>
        <tr>
          <AssignCell
            label={overrides.label ?? "モード"}
            name={overrides.name}
            options={overrides.options ?? [{ id: null, label: "モードなし" }]}
            selectedId={overrides.selectedId ?? null}
            dimmed={overrides.dimmed ?? ""}
            isEditing={overrides.isEditing ?? false}
            onOpen={overrides.onOpen ?? vi.fn()}
            onSelect={overrides.onSelect ?? vi.fn()}
            onClose={overrides.onClose ?? vi.fn()}
          />
        </tr>
      </tbody>
    </table>
  );
}

// プロジェクト列・モード列が共有するセル（§3.3「プロジェクト列・モード列の共通規則」）。
// 2列への配線（label・列位置）は task-row.test.tsx、名前の解決（modeId → Mode）は
// daily-list.test.tsx が見る
describe("AssignCell（画面定義書01 §3.3 / O-5: 割り当ての入口になるセル）", () => {
  it("未設定は薄色の `-`（00_共通 §2.4: 空欄にしない）", () => {
    const { container } = renderCell();

    const button = within(container.querySelector("td") as HTMLElement).getByRole("button");
    // 空欄にしない（クリックして設定できることが伝わらないため）
    expect(button.textContent).toBe("-");
    expect((button.firstElementChild as HTMLElement).classList.contains("text-ink-faint")).toBe(true);
  });

  it("割り当て済みは名前を出し、aria-label にも載せる", () => {
    renderCell({ label: "プロジェクト", name: "サイト改善" });

    expect(screen.getByLabelText("プロジェクト（サイト改善）").textContent).toBe("サイト改善");
  });
});
