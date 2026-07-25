import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/domain/project/project";

import { deferredAction, rowOf, startEditingCell } from "../_testing/table-helpers";

// Server Action の先は実DB接続と revalidatePath に届くため、同じ返り値の契約
// （ActionResult）を返す偽物へ差し替える（アーキテクチャ定義書 §8「偽物を置いてよい境界」）
vi.mock("./actions", () => ({
  createProjectAction: vi.fn(),
  updateProjectAction: vi.fn(),
  setProjectArchivedAction: vi.fn(),
  deleteProjectAction: vi.fn(),
}));

import {
  createProjectAction,
  deleteProjectAction,
  setProjectArchivedAction,
  updateProjectAction,
} from "./actions";
import { ProjectsTable } from "./projects-table";

const project = (id: number, name: string, isArchived = false): Project => ({
  id,
  name,
  isArchived,
});

const ACTIVE = [project(1, "プロジェクトA"), project(2, "プロジェクトB")] as const;

function renderTable(
  props: Partial<{
    active: readonly Project[];
    archived: readonly Project[];
    deletableIds: readonly number[];
  }> = {}
) {
  return render(
    <ProjectsTable
      active={props.active ?? ACTIVE}
      archived={props.archived ?? []}
      deletableIds={props.deletableIds ?? []}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createProjectAction).mockResolvedValue({ ok: true });
  vi.mocked(updateProjectAction).mockResolvedValue({ ok: true });
  vi.mocked(setProjectArchivedAction).mockResolvedValue({ ok: true });
  vi.mocked(deleteProjectAction).mockResolvedValue({ ok: true });
});

describe("ProjectsTable（画面定義書03 §3.3: 名前とアーカイブだけの単純なCRUD）", () => {
  it("有効なプロジェクトを一覧に出す", () => {
    renderTable();

    expect(screen.getByRole("button", { name: "プロジェクトA" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "プロジェクトB" })).not.toBeNull();
  });

  it("1件も無ければ空であることを文言で示す", () => {
    renderTable({ active: [] });

    expect(screen.getByText("プロジェクトはまだありません。")).not.toBeNull();
  });

  it("新規追加の行を開いている間は空の文言を出さない", () => {
    renderTable({ active: [] });

    fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

    expect(screen.queryByText("プロジェクトはまだありません。")).toBeNull();
    expect(screen.getByPlaceholderText("プロジェクト名")).not.toBeNull();
  });

  describe("インライン編集（画面定義書03 §4「編集方式」/ 00_共通 §2.3）", () => {
    it("名前セルをクリックするとその場が入力欄になる", () => {
      renderTable();

      const input = startEditingCell("プロジェクトA");

      expect(input.tagName).toBe("INPUT");
      expect(within(rowOf("プロジェクトB")).getByRole("button", { name: "プロジェクトB" })).not.toBeNull();
    });

    it("変更なしの確定は何も送信せず閉じる", async () => {
      renderTable();
      const input = startEditingCell("プロジェクトA");

      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "プロジェクトA" })).not.toBeNull();
      });
      expect(updateProjectAction).not.toHaveBeenCalled();
    });

    it("フォーカスが外れたときに変更を確定する", async () => {
      renderTable();
      const input = startEditingCell("プロジェクトA");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateProjectAction).toHaveBeenCalledExactlyOnceWith(1, { name: "改名後" });
      });
    });

    it("Enter でも確定する（入力欄を抜けて blur の経路に合流する）", async () => {
      renderTable();
      const input = startEditingCell("プロジェクトB");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(updateProjectAction).toHaveBeenCalledExactlyOnceWith(2, { name: "改名後" });
      });
    });

    it("Esc は元の値に戻して閉じる（送信しない）", async () => {
      renderTable();
      const input = startEditingCell("プロジェクトA");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "プロジェクトA" })).not.toBeNull();
      });
      expect(updateProjectAction).not.toHaveBeenCalled();
    });

    // 保存中の抑止（00_共通 §2.3「保存中」）は modes/sections の名前セルには入っているが
    // projects には無い。実装の差は FB-63 で検討中のため、現状を正直に固定しておく
    it("projects の名前セルは保存中も押せる（modes/sections と違い disabled が無い。FB-63 で検討中）", async () => {
      const pending = deferredAction();
      vi.mocked(setProjectArchivedAction).mockReturnValue(pending.promise);
      renderTable();

      fireEvent.click(within(rowOf("プロジェクトA")).getByRole("button", { name: "アーカイブ" }));

      const row = rowOf("プロジェクトA");
      await waitFor(() => {
        expect(within(row).getByRole("button", { name: "アーカイブ" })).toHaveProperty(
          "disabled",
          true
        );
      });
      // 送信中でも名前セルは押せてしまい、古い値で編集を開始できる（＝条項からの逸脱の実体）
      const nameCell = within(row).getByRole("button", { name: "プロジェクトA" });
      expect(nameCell).toHaveProperty("disabled", false);

      fireEvent.click(nameCell);
      expect(screen.getByDisplayValue("プロジェクトA")).not.toBeNull();

      await act(async () => {
        pending.resolve({ ok: true });
      });
      // アーカイブが返ったあとも、送信前の値を抱えた入力欄が残る
      expect(screen.getByDisplayValue("プロジェクトA")).not.toBeNull();
    });

    it("失敗したらメッセージを出し、編集状態のまま残す（入力し直せる）", async () => {
      vi.mocked(updateProjectAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderTable();
      const input = startEditingCell("プロジェクトA");

      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText("名前を入力してください")).not.toBeNull();
      });
      expect(screen.getByDisplayValue("")).toBe(input);
      expect(screen.queryByRole("button", { name: "プロジェクトA" })).toBeNull();
    });

    it("次の編集を始めるとエラー表示を消す", async () => {
      vi.mocked(updateProjectAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderTable();
      const input = startEditingCell("プロジェクトA");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      await waitFor(() => {
        expect(screen.getByText("名前を入力してください")).not.toBeNull();
      });

      fireEvent.click(within(rowOf("プロジェクトB")).getByRole("button", { name: "プロジェクトB" }));

      expect(screen.queryByText("名前を入力してください")).toBeNull();
    });
  });

  describe("新規追加", () => {
    it("「保存」で追加を送る", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "新しいプロジェクト" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(createProjectAction).toHaveBeenCalledExactlyOnceWith({ name: "新しいプロジェクト" });
      });
    });

    it("成功したら新規行を閉じる（保存の完了を待って反映する。§1）", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "新しいプロジェクト" },
      });

      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();
      });
    });

    it("Enter でも追加を送る（新規行は blur 経路を通らない）", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      const input = screen.getByPlaceholderText("プロジェクト名");

      fireEvent.change(input, { target: { value: "新しいプロジェクト" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(createProjectAction).toHaveBeenCalledExactlyOnceWith({ name: "新しいプロジェクト" });
      });
    });

    it("「取消」で新規行を捨てる（送信しない）", () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "書きかけ" },
      });

      fireEvent.click(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();
      expect(createProjectAction).not.toHaveBeenCalled();
    });

    it("「保存」の押下は入力欄の blur より先に拾う（mousedown の既定動作を抑止して二重送信を防ぐ）", () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      // preventDefault されると fireEvent は false を返す（＝入力欄はフォーカスを失わない）
      expect(fireEvent.mouseDown(screen.getByRole("button", { name: "保存" }))).toBe(false);
    });

    it("Esc でも新規行を捨てる", () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.keyDown(screen.getByPlaceholderText("プロジェクト名"), { key: "Escape" });

      expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();
      expect(createProjectAction).not.toHaveBeenCalled();
    });

    it("追加の失敗はメッセージで知らせ、新規行を残す（00_共通 §2.3「失敗時」）", async () => {
      vi.mocked(createProjectAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(screen.getByText("名前を入力してください")).not.toBeNull();
      });
      expect(screen.getByPlaceholderText("プロジェクト名")).not.toBeNull();
    });
  });

  describe("アーカイブと物理削除（画面定義書03 §4 / §4.1）", () => {
    it("「アーカイブ」はアーカイブ済みへ移す（物理削除はしない）", async () => {
      renderTable();

      fireEvent.click(within(rowOf("プロジェクトA")).getByRole("button", { name: "アーカイブ" }));

      await waitFor(() => {
        expect(setProjectArchivedAction).toHaveBeenCalledExactlyOnceWith(1, true);
      });
      expect(deleteProjectAction).not.toHaveBeenCalled();
    });

    it("有効な行に「削除」は出さない（整理はアーカイブ → 削除の順。§4.1）", () => {
      renderTable({ deletableIds: [1, 2] });

      expect(within(rowOf("プロジェクトA")).queryByRole("button", { name: "削除" })).toBeNull();
    });

    it("アーカイブ済みの「復元」は有効へ戻す", async () => {
      renderTable({ archived: [project(9, "旧プロジェクト", true)] });

      fireEvent.click(within(rowOf("旧プロジェクト")).getByRole("button", { name: "復元" }));

      await waitFor(() => {
        expect(setProjectArchivedAction).toHaveBeenCalledExactlyOnceWith(9, false);
      });
    });

    it("復元の失敗（別タブで対象が消えた等）はメッセージで知らせる", async () => {
      vi.mocked(setProjectArchivedAction).mockResolvedValue({
        ok: false,
        message: "対象が見つかりません（画面を再読み込みしてください）",
      });
      renderTable({ archived: [project(9, "旧プロジェクト", true)] });

      fireEvent.click(within(rowOf("旧プロジェクト")).getByRole("button", { name: "復元" }));

      await waitFor(() => {
        expect(screen.getByText("対象が見つかりません（画面を再読み込みしてください）")).not.toBeNull();
      });
    });

    // 2段階の確認そのものは DeleteMasterButton のテストが持つ。ここは配線だけを見る
    it("参照0件のアーカイブ済み行だけを物理削除へ配線する", async () => {
      renderTable({ archived: [project(9, "旧プロジェクト", true)], deletableIds: [9] });
      const row = rowOf("旧プロジェクト");

      fireEvent.click(within(row).getByRole("button", { name: "削除" }));
      fireEvent.click(within(row).getByRole("button", { name: "削除する" }));

      await waitFor(() => {
        expect(deleteProjectAction).toHaveBeenCalledExactlyOnceWith(9);
      });
    });

  });
});
