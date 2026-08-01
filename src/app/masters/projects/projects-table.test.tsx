import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/domain/project/project";

import { deferredAction } from "@/app/_testing/actions";
import { rowOf } from "@/app/_testing/dom";
import { click } from "@/app/_testing/interactions";
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

  // 説明文は共通の外枠（MasterTableFrame）へ prop で渡すので、表ごとに渡し違えていないかを見る（T-79）
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

    await click(screen.getByRole("button", { name: "新規追加" }));

    expect(screen.queryByText("プロジェクトはまだありません。")).toBeNull();
    expect(screen.getByPlaceholderText("プロジェクト名")).not.toBeNull();
  });

  describe("インライン編集（画面定義書03 §4「編集方式」/ 00_共通 §2.3）", () => {
    it("名前セルをクリックするとその場が入力欄になる", async () => {
      renderTable();

      const input = await startEditingCell("プロジェクトA");

      expect(input.tagName).toBe("INPUT");
      expect(within(rowOf("プロジェクトB")).getByRole("button", { name: "プロジェクトB" })).not.toBeNull();
    });

    it("変更なしの確定は何も送信せず閉じる", async () => {
      renderTable();
      const input = await startEditingCell("プロジェクトA");

      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "プロジェクトA" })).not.toBeNull();
      });
      expect(updateProjectAction).not.toHaveBeenCalled();
    });

    it("フォーカスが外れたときに変更を確定する", async () => {
      renderTable();
      const input = await startEditingCell("プロジェクトA");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateProjectAction).toHaveBeenCalledExactlyOnceWith(1, { name: "改名後" });
      });
    });

    it("Enter でも確定する（入力欄を抜けて blur の経路に合流する）", async () => {
      renderTable();
      const input = await startEditingCell("プロジェクトB");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(updateProjectAction).toHaveBeenCalledExactlyOnceWith(2, { name: "改名後" });
      });
    });

    it("Esc は元の値に戻して閉じる（送信しない）", async () => {
      renderTable();
      const input = await startEditingCell("プロジェクトA");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "プロジェクトA" })).not.toBeNull();
      });
      expect(updateProjectAction).not.toHaveBeenCalled();
    });

    // 行内に編集可能なセルが1つ（名前）だけでも保存中は開かせない（00_共通 §2.3「保存中」）。
    // modes/sections と同じ部品（MasterEditableCell）を使うことで揃った（T-44 / FB-63）
    it("保存中は名前セルを開けない（古い値での上書きを防ぐ）", async () => {
      const pending = deferredAction();
      vi.mocked(setProjectArchivedAction).mockReturnValue(pending.promise);
      renderTable();

      await click(within(rowOf("プロジェクトA")).getByRole("button", { name: "アーカイブ" }));

      const row = rowOf("プロジェクトA");
      const nameCell = within(row).getByRole("button", { name: "プロジェクトA" });
      expect(nameCell).toHaveProperty("disabled", true);
      // 行の操作ボタンも送信中は押せない（多重送信を防ぐ）
      expect(within(row).getByRole("button", { name: "アーカイブ" })).toHaveProperty(
        "disabled",
        true
      );

      // 送信中に開こうとしても入力欄にならない（古い値を再送しうる経路が閉じている）
      await click(nameCell);
      expect(screen.queryByDisplayValue("プロジェクトA")).toBeNull();

      await act(async () => {
        pending.resolve({ ok: true });
      });
      // 保存が返れば再び編集できる
      expect(
        within(rowOf("プロジェクトA")).getByRole("button", { name: "プロジェクトA" })
      ).toHaveProperty("disabled", false);
    });

    it("失敗したらメッセージを出し、編集状態のまま残す（入力し直せる）", async () => {
      vi.mocked(updateProjectAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderTable();
      const input = await startEditingCell("プロジェクトA");

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
      const input = await startEditingCell("プロジェクトA");
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
      const input = await startEditingCell("プロジェクトA");
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
      await click(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "新しいプロジェクト" },
      });
      await click(screen.getByRole("button", { name: "保存" }));

      expect(createProjectAction).toHaveBeenCalledExactlyOnceWith({ name: "新しいプロジェクト" });
    });

    it("成功したら新規行を閉じる（保存の完了を待って反映する。§1）", async () => {
      renderTable();
      await click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "新しいプロジェクト" },
      });

      await click(screen.getByRole("button", { name: "保存" }));

      expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();
    });

    it("Enter でも追加を送る（新規行は blur 経路を通らない）", async () => {
      renderTable();
      await click(screen.getByRole("button", { name: "新規追加" }));
      const input = screen.getByPlaceholderText("プロジェクト名");

      fireEvent.change(input, { target: { value: "新しいプロジェクト" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(createProjectAction).toHaveBeenCalledExactlyOnceWith({ name: "新しいプロジェクト" });
      });
    });

    it("「取消」で新規行を捨てる（送信しない）", async () => {
      renderTable();
      await click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "書きかけ" },
      });

      await click(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();
      expect(createProjectAction).not.toHaveBeenCalled();
    });

    it("「保存」の押下は入力欄の blur より先に拾う（mousedown の既定動作を抑止して二重送信を防ぐ）", async () => {
      renderTable();
      await click(screen.getByRole("button", { name: "新規追加" }));

      // preventDefault されると fireEvent は false を返す（＝入力欄はフォーカスを失わない）
      expect(fireEvent.mouseDown(screen.getByRole("button", { name: "保存" }))).toBe(false);
    });

    it("Esc でも新規行を捨てる", async () => {
      renderTable();
      await click(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.keyDown(screen.getByPlaceholderText("プロジェクト名"), { key: "Escape" });

      expect(screen.queryByPlaceholderText("プロジェクト名")).toBeNull();
      expect(createProjectAction).not.toHaveBeenCalled();
    });

    // 応答を自分で解くのは、抑止が解けたことを見るため——即解決のモックだと抑止が掛かった
    // 瞬間を観測できず、「解けた」と「そもそも抑止されなかった」を区別できない
    it("追加の失敗はメッセージで知らせ、新規行を残す（00_共通 §2.3「失敗時」）", async () => {
      const pending = deferredAction();
      vi.mocked(createProjectAction).mockReturnValue(pending.promise);
      renderTable();
      await click(screen.getByRole("button", { name: "新規追加" }));
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

    // 「保存中に始める操作」も止める（§2.3）——押すと開いていたセルが閉じ、
    // 失敗が返っても入力し直せなくなる。守りたいのは「開いている入力欄が残る」こと。
    // 抑止そのものは MasterTableFrame が持つが、isPending を渡す配線は表ごとなのでここで見る
    it("保存中の「新規追加」は開いている編集セルを閉じない", async () => {
      const pending = deferredAction();
      vi.mocked(setProjectArchivedAction).mockReturnValue(pending.promise);
      renderTable();
      // プロジェクトB を編集中にしたまま、別行のアーカイブで保存中にする
      const input = await startEditingCell("プロジェクトB");
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

    // 00_共通 §2.3「新規追加行の保存中」——確定と取消をどちらも止める
    it("保存中の Enter 連打でも追加は1回だけ送る", async () => {
      const pending = deferredAction();
      vi.mocked(createProjectAction).mockReturnValue(pending.promise);
      renderTable();
      await click(screen.getByRole("button", { name: "新規追加" }));
      const input = screen.getByPlaceholderText("プロジェクト名");
      fireEvent.change(input, { target: { value: "新しいプロジェクト" } });

      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() => {
        expect(createProjectAction).toHaveBeenCalledOnce();
      });
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(createProjectAction).toHaveBeenCalledExactlyOnceWith({ name: "新しいプロジェクト" });

      await act(async () => {
        pending.resolve({ ok: true });
      });
    });

    it("保存中は取消で新規行を閉じない（失敗のメッセージだけが残るのを防ぐ）", async () => {
      const pending = deferredAction();
      vi.mocked(createProjectAction).mockReturnValue(pending.promise);
      renderTable();
      await click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
        target: { value: "新しいプロジェクト" },
      });
      await click(screen.getByRole("button", { name: "保存" }));

      const cancel = screen.getByRole("button", { name: "取消" });
      expect(cancel).toHaveProperty("disabled", true);
      await click(cancel);
      fireEvent.keyDown(screen.getByPlaceholderText("プロジェクト名"), { key: "Escape" });

      expect(screen.getByPlaceholderText("プロジェクト名")).not.toBeNull();

      // 失敗が返ってはじめて入力し直せる状態になる（§2.3「失敗時」の詳細は上のテストが持つ）
      await act(async () => {
        pending.resolve({ ok: false, message: "名前を入力してください" });
      });
      expect(screen.getByPlaceholderText("プロジェクト名")).not.toBeNull();
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

    // 2段階の確認そのものは DeleteMasterButton のテストが持つ。ここは配線だけを見る
    it("参照0件のアーカイブ済み行だけを物理削除へ配線する", async () => {
      renderTable({ archived: [project(9, "旧プロジェクト", true)], deletableIds: [9] });
      const row = rowOf("旧プロジェクト");

      await click(within(row).getByRole("button", { name: "削除" }));
      await click(within(row).getByRole("button", { name: "削除する" }));

      expect(deleteProjectAction).toHaveBeenCalledExactlyOnceWith(9);
    });
  });
});
