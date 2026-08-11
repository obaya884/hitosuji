import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/domain/project/project";

import { deferredAction } from "@/app/_testing/actions";
import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { rowOf } from "@/app/_testing/table";
import { startEditingCell } from "../_testing/table-helpers";

// Server Action の先は実DB接続と revalidatePath に届くため、同じ返り値の契約
// （ActionResult）を返す偽物へ差し替える（テスト戦略定義書 §2「偽物を置いてよい境界」）
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

  // 説明文は共通の外枠（TableFrame）へ prop で渡すので、表ごとに渡し違えていないかを見る（T-79）
  it("並び順の決まり方を説明文で伝える（§3.3: 並び順は名前順）", () => {
    renderTable();

    expect(screen.getByText(/並び順は名前順です/)).not.toBeNull();
  });

  it("1件も無ければ空であることを文言で示す", () => {
    renderTable({ active: [] });

    expect(screen.getByText("プロジェクトはまだありません。")).not.toBeNull();
  });

  it("新規追加の行を開いている間は空の文言を出さない", async () => {
    renderTable({ active: [] });

    clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

    expect(screen.queryByText("プロジェクトはまだありません。")).toBeNull();
    expect(screen.getByPlaceholderText("プロジェクト名")).not.toBeNull();
  });

  describe("インライン編集（画面定義書03 §4「編集方式」/ 00_共通 §2.3）", () => {
    it("フォーカスが外れたときに変更を確定する", async () => {
      renderTable();
      const input = startEditingCell("プロジェクトA");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateProjectAction).toHaveBeenCalledExactlyOnceWith(1, { name: "改名後" });
      });
    });

    // 抑止そのものは部品（EditableCell）が持つ。ここで見るのは表が `isPending` を
    // セルへ渡していることと、表の JSX が持つ操作ボタン側の抑止（§6 の②）。
    // 行内に編集できるセルが1つ（名前）だけの表でも一様に止まる（FB-63）
    it("保存中は行の編集セル・操作ボタンを押せない", async () => {
      const pending = deferredAction();
      vi.mocked(setProjectArchivedAction).mockReturnValue(pending.promise);
      renderTable();

      await click(within(rowOf("プロジェクトA")).getByRole("button", { name: "アーカイブ" }));

      const row = rowOf("プロジェクトA");
      const nameCell = within(row).getByRole("button", { name: "プロジェクトA" });
      expect(nameCell).toHaveProperty("disabled", true);
      expect(within(row).getByRole("button", { name: "アーカイブ" })).toHaveProperty(
        "disabled",
        true
      );
      // 押しても開かない（古い値を再送しうる経路が閉じている）
      await click(nameCell);
      expect(screen.queryByDisplayValue("プロジェクトA")).toBeNull();

      await act(async () => {
        pending.resolve({ ok: true });
      });
      expect(
        within(rowOf("プロジェクトA")).getByRole("button", { name: "プロジェクトA" })
      ).toHaveProperty("disabled", false);
    });

    // onClose が表の editing を落としているか（§6 の②）。Esc の挙動そのものは部品段が持つ
    it("Esc でセルが閉じ、元の表示に戻る", async () => {
      renderTable();
      const input = startEditingCell("プロジェクトA");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "プロジェクトA" })).not.toBeNull();
      });
      expect(updateProjectAction).not.toHaveBeenCalled();
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
      // メッセージの表示と isPending の解除は別のタイミングで届く。§2.3 が要求するのは
      // 「同じ行」の抑止だが、実装は isPending を表ごとに1つ持つので他行のセルも止まる。
      // そのため押せる状態に戻るまで待ってからでないと click が無視される
      const otherCell = await waitFor(() => {
        expect(screen.getByText("名前を入力してください")).not.toBeNull();
        const cell = within(rowOf("プロジェクトB")).getByRole("button", { name: "プロジェクトB" });
        expect(cell).toHaveProperty("disabled", false);
        return cell;
      });

      await click(otherCell);

      expect(screen.queryByText("名前を入力してください")).toBeNull();
    });
  });

  describe("新規追加", () => {
    // 「新規追加」も次の編集の始まりなので、直前の失敗の帯を消す（表側に残った配線。T-79）
    it("「新規追加」を押すとエラー表示を消す", async () => {
      vi.mocked(updateProjectAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderTable();
      const input = startEditingCell("プロジェクトA");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      // 保存中は「新規追加」が押せないので、押せる状態に戻るまで待つ
      const addNew = await waitFor(() => {
        expect(screen.getByText("名前を入力してください")).not.toBeNull();
        const button = screen.getByRole("button", { name: "新規追加" });
        expect(button).toHaveProperty("disabled", false);
        return button;
      });
      await click(addNew);

      expect(screen.queryByText("名前を入力してください")).toBeNull();
    });

    it("「保存」で追加を送る", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "新しいプロジェクト" },
      });
      await click(screen.getByRole("button", { name: "保存" }));

      expect(createProjectAction).toHaveBeenCalledExactlyOnceWith({ name: "新しいプロジェクト" });
    });

    it("成功したら新規行を閉じる（保存の完了を待って反映する。§1）", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "新しいプロジェクト" },
      });

      await click(screen.getByRole("button", { name: "保存" }));

      expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();
    });

    // onCancel が表の editing を落としているか（§6 の②）。取消・Esc の挙動そのものは部品段が持つ
    it("「取消」で新規行が消える（送信しない）", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "書きかけ" },
      });

      clickWithoutServer(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();
      expect(createProjectAction).not.toHaveBeenCalled();
    });

    // 応答を自分で解くのは、抑止が解けたことを見るため——即解決のモックだと抑止が掛かった
    // 瞬間を観測できず、「解けた」と「そもそも抑止されなかった」を区別できない
    it("追加の失敗はメッセージで知らせ、新規行を残す（00_共通 §2.3「失敗時」）", async () => {
      const pending = deferredAction();
      vi.mocked(createProjectAction).mockReturnValue(pending.promise);
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      // 名前を入れてから送る——未入力のままだと、将来「未入力なら保存を非活性」を足したときに
      // 下の `disabled` が別の理由で真になり、抑止を見ているという主張が崩れる
      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "新しいプロジェクト" },
      });

      await click(screen.getByRole("button", { name: "保存" }));

      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);

      // 解決も act の中で流し切るので、以降は同期に見てよい
      await act(async () => {
        pending.resolve({ ok: false, message: "名前を入力してください" });
      });

      expect(screen.getByText("名前を入力してください")).not.toBeNull();
      expect(screen.getByPlaceholderText("プロジェクト名")).not.toBeNull();
      // 抑止が解けたままにならない＝入力し直して保存できる（§2.3「失敗時」）
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", false);
      expect(screen.getByRole("button", { name: "取消" })).toHaveProperty("disabled", false);
    });

    // 表が `isPending` を TableFrame へ渡しているか（§6 の②）。押せると開いていたセルが閉じ、
    // 失敗が返っても入力し直せなくなる
    it("保存中は「新規追加」を押せない", async () => {
      const pending = deferredAction();
      vi.mocked(setProjectArchivedAction).mockReturnValue(pending.promise);
      renderTable();
      // プロジェクトB を編集中にしたまま、別行のアーカイブで保存中にする
      const input = startEditingCell("プロジェクトB");
      await click(within(rowOf("プロジェクトA")).getByRole("button", { name: "アーカイブ" }));

      const create = screen.getByRole("button", { name: "新規追加" });
      expect(create).toHaveProperty("disabled", true);
      await click(create);

      expect(screen.getByDisplayValue("プロジェクトB")).toBe(input);
      expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();

      await act(async () => {
        pending.resolve({ ok: true });
      });
      expect(screen.getByRole("button", { name: "新規追加" })).toHaveProperty("disabled", false);
    });
  });

  describe("アーカイブと物理削除（画面定義書03 §4 / §4.1）", () => {
    it("「アーカイブ」はアーカイブ済みへ移す（物理削除はしない）", async () => {
      renderTable();

      await click(within(rowOf("プロジェクトA")).getByRole("button", { name: "アーカイブ" }));

      expect(setProjectArchivedAction).toHaveBeenCalledExactlyOnceWith(1, true);
      expect(deleteProjectAction).not.toHaveBeenCalled();
    });

    it("有効な行に「削除」は出さない（整理はアーカイブ → 削除の順。§4.1）", () => {
      renderTable({ deletableIds: [1, 2] });

      expect(within(rowOf("プロジェクトA")).queryByRole("button", { name: "削除" })).toBeNull();
    });

    it("アーカイブ済みの「復元」は有効へ戻す", async () => {
      renderTable({ archived: [project(9, "旧プロジェクト", true)] });

      await click(within(rowOf("旧プロジェクト")).getByRole("button", { name: "復元" }));

      expect(setProjectArchivedAction).toHaveBeenCalledExactlyOnceWith(9, false);
    });

    it("復元の失敗（別タブで対象が消えた等）はメッセージで知らせる", async () => {
      vi.mocked(setProjectArchivedAction).mockResolvedValue({
        ok: false,
        message: "対象が見つかりません（すでに削除されている可能性があります）",
      });
      renderTable({ archived: [project(9, "旧プロジェクト", true)] });

      await click(within(rowOf("旧プロジェクト")).getByRole("button", { name: "復元" }));

      expect(screen.getByText("対象が見つかりません（すでに削除されている可能性があります）")).not.toBeNull();
    });

    // 2段階の確認そのものは DeleteButton のテストが持つ。ここは配線だけを見る
    it("参照0件のアーカイブ済み行だけを物理削除へ配線する", async () => {
      renderTable({ archived: [project(9, "旧プロジェクト", true)], deletableIds: [9] });
      const row = rowOf("旧プロジェクト");

      clickWithoutServer(within(row).getByRole("button", { name: "削除" }));
      await click(within(row).getByRole("button", { name: "削除する" }));

      expect(deleteProjectAction).toHaveBeenCalledExactlyOnceWith(9);
    });
  });
});
