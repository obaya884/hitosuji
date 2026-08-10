import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { rowOf } from "@/app/_testing/table";
import { ArchivedMasterSection } from "./archived-master-section";

type Item = Readonly<{ id: number; name: string }>;

const item = (id: number, name: string): Item => ({ id, name });

/** 呼び出し側（各テーブル）と同じく、ラベル列の `<td>` を渡す */
const renderCells = (master: Item) => <td>{master.name}</td>;

function renderSection(
  props: Partial<{
    archived: readonly Item[];
    deletableIds: readonly number[];
    isPending: boolean;
    onRestore: (id: number) => void;
    onDelete: (id: number) => void;
  }> = {}
) {
  return render(
    <ArchivedMasterSection
      archived={props.archived ?? [item(1, "マスタA"), item(2, "マスタB")]}
      deletableIds={props.deletableIds ?? []}
      isPending={props.isPending ?? false}
      renderCells={renderCells}
      onRestore={props.onRestore ?? vi.fn()}
      onDelete={props.onDelete ?? vi.fn()}
    />
  );
}

// アーカイブは物理削除ではなく、一覧下部に折りたたみ表示して復元可能にする（画面定義書03 §4）
describe("ArchivedMasterSection（画面定義書03 §4: アーカイブ済みは折りたたみ表示・復元可能）", () => {
  it("アーカイブ済みが0件なら節を出さない", () => {
    const { container } = renderSection({ archived: [] });

    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByText(/アーカイブ済み/)).toBeNull();
  });

  it("折りたたみ（details）で件数付きの見出しを出し、既定では開かない", () => {
    const { container } = renderSection();

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).toHaveProperty("open", false);
    expect(within(details as HTMLElement).getByText("アーカイブ済み（2）")).not.toBeNull();
  });

  it("各行にラベル列と「復元」を置く", () => {
    renderSection();

    expect(within(rowOf("マスタA")).getByRole("button", { name: "復元" })).not.toBeNull();
    expect(within(rowOf("マスタB")).getByRole("button", { name: "復元" })).not.toBeNull();
  });

  it("「復元」でその行の id を渡す（アーカイブは元に戻せる）", () => {
    const onRestore = vi.fn();
    renderSection({ onRestore });

    fireEvent.click(within(rowOf("マスタB")).getByRole("button", { name: "復元" }));

    expect(onRestore).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("参照0件の行にだけ「削除」を出す（§4.1: 参照がある行にはボタン自体を出さない）", () => {
    renderSection({ deletableIds: [2] });

    expect(within(rowOf("マスタA")).queryByRole("button", { name: "削除" })).toBeNull();
    expect(within(rowOf("マスタB")).getByRole("button", { name: "削除" })).not.toBeNull();
  });

  it("削除は2段階の確認を経てその行の id を渡す（§4.1）", () => {
    const onDelete = vi.fn();
    renderSection({ deletableIds: [1, 2], onDelete });
    const row = rowOf("マスタA");

    fireEvent.click(within(row).getByRole("button", { name: "削除" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole("button", { name: "削除する" }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("保存中は「復元」も「削除する」も押せない（保存中の状態を削除ボタンまで渡す）", () => {
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    renderSection({ isPending: true, deletableIds: [1], onRestore, onDelete });
    const row = rowOf("マスタA");

    const restore = within(row).getByRole("button", { name: "復元" });
    expect(restore).toHaveProperty("disabled", true);
    fireEvent.click(restore);
    expect(onRestore).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole("button", { name: "削除" }));
    const execute = within(row).getByRole("button", { name: "削除する" });
    expect(execute).toHaveProperty("disabled", true);
    fireEvent.click(execute);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
