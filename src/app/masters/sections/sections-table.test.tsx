import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/domain/section/section";

import { rowOf } from "@/app/_testing/dom";
import { deferredAction } from "@/app/_testing/actions";
import { startEditingCell } from "../_testing/table-helpers";

// Server Action の先は実DB接続と revalidatePath に届くため、同じ返り値の契約
// （ActionResult）を返す偽物へ差し替える（アーキテクチャ定義書 §8「偽物を置いてよい境界」）
vi.mock("./actions", () => ({
  archiveSectionAction: vi.fn(),
  createSectionAction: vi.fn(),
  deleteSectionAction: vi.fn(),
  restoreSectionAction: vi.fn(),
  setDayStartSectionAction: vi.fn(),
  updateSectionAction: vi.fn(),
}));

import {
  archiveSectionAction,
  createSectionAction,
  deleteSectionAction,
  restoreSectionAction,
  setDayStartSectionAction,
  updateSectionAction,
} from "./actions";
import { SectionsTable } from "./sections-table";

/** 一覧が受け取る行（終了時刻は次セクションの開始からの導出値。§3.1） */
type SectionRow = Section & { endTime: string };

const section = (
  id: number,
  name: string,
  startTime: string,
  over: Partial<SectionRow> = {}
): SectionRow => ({
  id,
  name,
  startTime,
  endTime: "00:00",
  isArchived: false,
  isDayStart: false,
  ...over,
});

const RANGES = [
  section(1, "セクションA", "06:00", { endTime: "12:00", isDayStart: true }),
  section(2, "セクションB", "12:00", { endTime: "06:00" }),
] as const;

function renderTable(
  props: Partial<{
    ranges: readonly SectionRow[];
    archived: readonly Section[];
    deletableIds: readonly number[];
  }> = {}
) {
  return render(
    <SectionsTable
      ranges={props.ranges ?? RANGES}
      archived={props.archived ?? []}
      deletableIds={props.deletableIds ?? []}
    />
  );
}

/**
 * 開始時刻セルを押して編集に入る（名前セルは startEditingCell）。
 * セルの見出しは `開始–終了` の枠なので、枠を組み立てて押し、開始時刻の入力欄を返す
 */
const startEditingStartTime = (
  name: string,
  startTime: string,
  endTime: string
): HTMLInputElement => {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name: `${startTime}–${endTime}` }));
  return screen.getByDisplayValue(startTime);
};

beforeEach(() => {
  vi.mocked(archiveSectionAction).mockResolvedValue({ ok: true });
  vi.mocked(createSectionAction).mockResolvedValue({ ok: true });
  vi.mocked(deleteSectionAction).mockResolvedValue({ ok: true });
  vi.mocked(restoreSectionAction).mockResolvedValue({ ok: true });
  vi.mocked(setDayStartSectionAction).mockResolvedValue({ ok: true });
  vi.mocked(updateSectionAction).mockResolvedValue({ ok: true });
});

describe("SectionsTable（画面定義書03 §3.1: 開始時刻・日界の選択・終了時刻は導出）", () => {
  it("時間帯は開始と導出した終了の枠で見せる（終了時刻は入力しない）", () => {
    renderTable();

    expect(within(rowOf("セクションA")).getByRole("button", { name: "06:00–12:00" })).not.toBeNull();
    // 最後のセクションの終了は先頭の開始へ折り返す
    expect(within(rowOf("セクションB")).getByRole("button", { name: "12:00–06:00" })).not.toBeNull();
  });

  // §3.1 の「行内に『1日の開始』等のラベルで現在の日界を示す」は実装に無く（ラジオの選択状態のみ）、
  // FB-62 として起票済み。実装されるまでテストは置かない
  describe("日界セクションの選択（F-116 / 画面定義書03 §3.1）", () => {
    it("ちょうど1行が選択された状態で示す", () => {
      renderTable();

      expect(screen.getByLabelText("セクションAを1日の開始にする")).toHaveProperty("checked", true);
      expect(screen.getByLabelText("セクションBを1日の開始にする")).toHaveProperty("checked", false);
    });

    it("ラジオを切り替えると日界をその行へ移す", async () => {
      renderTable();

      fireEvent.click(screen.getByLabelText("セクションBを1日の開始にする"));

      await waitFor(() => {
        expect(setDayStartSectionAction).toHaveBeenCalledExactlyOnceWith(2);
      });
    });

    it("日界切替の失敗はメッセージで知らせる（別タブで対象が消えた等）", async () => {
      vi.mocked(setDayStartSectionAction).mockResolvedValue({
        ok: false,
        message: "対象が見つかりません（画面を再読み込みしてください）",
      });
      renderTable();

      fireEvent.click(screen.getByLabelText("セクションBを1日の開始にする"));

      await waitFor(() => {
        expect(screen.getByText("対象が見つかりません（画面を再読み込みしてください）")).not.toBeNull();
      });
    });

    it("日界セクションはアーカイブできない（先に別セクションを日界に指定させる）", () => {
      renderTable();

      const archive = within(rowOf("セクションA")).getByRole("button", { name: "アーカイブ" });
      expect(archive).toHaveProperty("disabled", true);
      expect(archive.getAttribute("title")).toBe("日界セクションはアーカイブできません");

      fireEvent.click(archive);
      expect(archiveSectionAction).not.toHaveBeenCalled();
    });

    it("日界の指定が無い行（isDayStart 省略）は非日界として扱う（データモデル定義書 §3.1）", () => {
      renderTable({
        ranges: [
          section(1, "セクションA", "06:00", { endTime: "12:00", isDayStart: undefined }),
          section(2, "セクションB", "12:00", { endTime: "06:00", isDayStart: true }),
        ],
      });

      expect(screen.getByLabelText("セクションAを1日の開始にする")).toHaveProperty("checked", false);
      expect(
        within(rowOf("セクションA")).getByRole("button", { name: "アーカイブ" })
      ).toHaveProperty("disabled", false);
    });

    it("日界でない行はアーカイブできる", async () => {
      renderTable();

      const archive = within(rowOf("セクションB")).getByRole("button", { name: "アーカイブ" });
      expect(archive.getAttribute("title")).toBeNull();
      fireEvent.click(archive);

      await waitFor(() => {
        expect(archiveSectionAction).toHaveBeenCalledExactlyOnceWith(2);
      });
    });

    // 「有効セクション最低1件」はボタンの非活性では防げず（残り1件かは画面から分からない）、
    // サーバ側の再判定でしか出ない。§4.1「競合時」と同型で、文言が画面へ届く唯一の経路
    it("アーカイブの失敗（有効セクション最低1件）はメッセージで知らせる（§3.1）", async () => {
      vi.mocked(archiveSectionAction).mockResolvedValue({
        ok: false,
        message: "有効なセクションは最低1件必要です",
      });
      renderTable();

      fireEvent.click(within(rowOf("セクションB")).getByRole("button", { name: "アーカイブ" }));

      await waitFor(() => {
        expect(screen.getByText("有効なセクションは最低1件必要です")).not.toBeNull();
      });
    });
  });

  describe("インライン編集（画面定義書03 §4「編集方式」/ 00_共通 §2.3）", () => {
    it("名前セルと開始時刻セルは独立して編集できる（一方だけが入力欄になる）", () => {
      renderTable();

      startEditingCell("セクションA");

      const row = rowOf("06:00–12:00");
      expect(within(row).getByRole("button", { name: "06:00–12:00" })).not.toBeNull();
      expect(screen.getAllByRole("textbox")).toHaveLength(1);
    });

    it("開始時刻の編集中も終了時刻は導出値のまま出す（編集できるのは開始のみ）", () => {
      renderTable();

      const input = startEditingStartTime("セクションA", "06:00", "12:00");

      expect(input.type).toBe("time");
      const derived = screen.getByTitle("次のセクションの開始時刻から自動導出");
      expect(derived.textContent).toBe("–12:00");
      expect(derived.tagName).not.toBe("INPUT");
    });

    it("名前の変更なしは何も送信せず閉じる", async () => {
      renderTable();
      const input = startEditingCell("セクションA");

      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "セクションA" })).not.toBeNull();
      });
      expect(updateSectionAction).not.toHaveBeenCalled();
    });

    it("開始時刻の変更なしは何も送信せず閉じる", async () => {
      renderTable();
      const input = startEditingStartTime("セクションA", "06:00", "12:00");

      fireEvent.blur(input);

      await waitFor(() => {
        expect(within(rowOf("セクションA")).getByRole("button", { name: "06:00–12:00" })).not.toBeNull();
      });
      expect(updateSectionAction).not.toHaveBeenCalled();
    });

    it("名前を変えると開始時刻は現在値のまま送る（§4「行の全項目をまとめて送る」）", async () => {
      renderTable();
      const input = startEditingCell("セクションB");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateSectionAction).toHaveBeenCalledExactlyOnceWith(2, {
          name: "改名後",
          startTime: "12:00",
        });
      });
    });

    it("開始時刻を変えると名前は現在値のまま送る", async () => {
      renderTable();
      const input = startEditingStartTime("セクションA", "06:00", "12:00");

      fireEvent.change(input, { target: { value: "07:30" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateSectionAction).toHaveBeenCalledExactlyOnceWith(1, {
          name: "セクションA",
          startTime: "07:30",
        });
      });
    });

    it("Enter でも確定する（入力欄を抜けて blur の経路に合流する）", async () => {
      renderTable();
      const input = startEditingCell("セクションA");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(updateSectionAction).toHaveBeenCalledExactlyOnceWith(1, {
          name: "改名後",
          startTime: "06:00",
        });
      });
    });

    it("Esc は元の値に戻して閉じる（送信しない）", async () => {
      renderTable();
      const input = startEditingStartTime("セクションA", "06:00", "12:00");
      fireEvent.change(input, { target: { value: "23:45" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(within(rowOf("セクションA")).getByRole("button", { name: "06:00–12:00" })).not.toBeNull();
      });
      expect(updateSectionAction).not.toHaveBeenCalled();
    });

    it("名前の Esc も元の値に戻して閉じる", async () => {
      renderTable();
      const input = startEditingCell("セクションB");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "セクションB" })).not.toBeNull();
      });
      expect(updateSectionAction).not.toHaveBeenCalled();
    });

    it("保存中は同じ行の他のセル（開始時刻・日界）を触らせない", async () => {
      const pending = deferredAction();
      vi.mocked(updateSectionAction).mockReturnValue(pending.promise);
      renderTable();
      const input = startEditingCell("セクションA");
      fireEvent.change(input, { target: { value: "改名後" } });

      fireEvent.blur(input);

      const row = rowOf("06:00–12:00");
      await waitFor(() => {
        expect(within(row).getByRole("button", { name: "06:00–12:00" })).toHaveProperty(
          "disabled",
          true
        );
      });
      expect(within(row).getByLabelText("セクションAを1日の開始にする")).toHaveProperty(
        "disabled",
        true
      );

      await act(async () => {
        pending.resolve({ ok: true });
      });
      expect(
        within(rowOf("セクションA")).getByRole("button", { name: "06:00–12:00" })
      ).toHaveProperty("disabled", false);
    });

    it("失敗したらメッセージを出し、編集状態のまま残す（入力し直せる）", async () => {
      vi.mocked(updateSectionAction).mockResolvedValue({
        ok: false,
        message: "同じ開始時刻の有効なセクションがあります",
      });
      renderTable();
      const input = startEditingStartTime("セクションA", "06:00", "12:00");

      fireEvent.change(input, { target: { value: "12:00" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText("同じ開始時刻の有効なセクションがあります")).not.toBeNull();
      });
      expect(screen.getByDisplayValue("12:00")).toBe(input);
    });

    it("次の編集を始めるとエラー表示を消す", async () => {
      vi.mocked(updateSectionAction).mockResolvedValue({
        ok: false,
        message: "開始時刻を HH:MM 形式で入力してください",
      });
      renderTable();
      const input = startEditingCell("セクションA");
      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);
      // メッセージの表示と isPending の解除は別のタイミングで届く。保存中は他行のセルも
      // 押せない（§2.3）ので、押せる状態に戻るまで待ってからでないと click が無視される
      const otherCell = await waitFor(() => {
        expect(screen.getByText("開始時刻を HH:MM 形式で入力してください")).not.toBeNull();
        const cell = within(rowOf("セクションB")).getByRole("button", { name: "セクションB" });
        expect(cell).toHaveProperty("disabled", false);
        return cell;
      });

      fireEvent.click(otherCell);

      expect(screen.queryByText("開始時刻を HH:MM 形式で入力してください")).toBeNull();
    });
  });

  describe("新規追加", () => {
    it("名前と開始時刻だけを入力し、終了時刻は自動導出であることを示す", () => {
      renderTable();

      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      expect(screen.getByPlaceholderText("セクション名")).not.toBeNull();
      expect(screen.getByTitle("次のセクションの開始時刻から自動導出").textContent).toBe("–自動");
      // 日界の選択は保存後に行うため、新規行にラジオは置かない
      expect(screen.getAllByRole("radio")).toHaveLength(RANGES.length);
    });

    it("「保存」で名前と開始時刻をまとめて送る", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.change(screen.getByPlaceholderText("セクション名"), {
        target: { value: "新セクション" },
      });
      const startTime = document.querySelector<HTMLInputElement>('input[data-field="startTime"]');
      fireEvent.change(startTime as HTMLInputElement, { target: { value: "21:00" } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(createSectionAction).toHaveBeenCalledExactlyOnceWith({
          name: "新セクション",
          startTime: "21:00",
        });
      });
    });

    it("成功したら新規行を閉じる（保存の完了を待って反映する。§1）", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("セクション名"), {
        target: { value: "新セクション" },
      });

      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("セクション名")).toBeNull();
      });
    });

    it("Enter でも追加を送る（新規行は blur 経路を通らない）", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      const name = screen.getByPlaceholderText("セクション名");

      fireEvent.change(name, { target: { value: "新セクション" } });
      fireEvent.keyDown(name, { key: "Enter" });

      await waitFor(() => {
        expect(createSectionAction).toHaveBeenCalledExactlyOnceWith({
          name: "新セクション",
          startTime: "",
        });
      });
    });

    it("「取消」で新規行を捨てる（送信しない）", () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("セクション名"), {
        target: { value: "書きかけ" },
      });

      fireEvent.click(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByPlaceholderText("セクション名")).toBeNull();
      expect(createSectionAction).not.toHaveBeenCalled();
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

      fireEvent.keyDown(screen.getByPlaceholderText("セクション名"), { key: "Escape" });

      expect(screen.queryByPlaceholderText("セクション名")).toBeNull();
      expect(createSectionAction).not.toHaveBeenCalled();
    });

    it("追加の失敗はメッセージで知らせ、新規行を残す（00_共通 §2.3「失敗時」）", async () => {
      vi.mocked(createSectionAction).mockResolvedValue({
        ok: false,
        message: "開始時刻を HH:MM 形式で入力してください",
      });
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("セクション名"), {
        target: { value: "新セクション" },
      });

      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(screen.getByText("開始時刻を HH:MM 形式で入力してください")).not.toBeNull();
      });
      expect(screen.getByPlaceholderText("セクション名")).not.toBeNull();
    });
  });

  describe("アーカイブと物理削除（画面定義書03 §4 / §4.1）", () => {
    it("アーカイブ済みは開始時刻を添えて出し、「復元」で有効へ戻す", async () => {
      renderTable({ archived: [section(9, "旧セクション", "03:00", { isArchived: true })] });
      const row = rowOf("旧セクション");

      expect(within(row).getByText("03:00")).not.toBeNull();
      fireEvent.click(within(row).getByRole("button", { name: "復元" }));

      await waitFor(() => {
        expect(restoreSectionAction).toHaveBeenCalledExactlyOnceWith(9);
      });
    });

    it("復元の失敗（開始時刻が他と重複する等）はメッセージで知らせる", async () => {
      vi.mocked(restoreSectionAction).mockResolvedValue({
        ok: false,
        message: "同じ開始時刻の有効なセクションがあります",
      });
      renderTable({ archived: [section(9, "旧セクション", "03:00", { isArchived: true })] });

      fireEvent.click(within(rowOf("旧セクション")).getByRole("button", { name: "復元" }));

      await waitFor(() => {
        expect(screen.getByText("同じ開始時刻の有効なセクションがあります")).not.toBeNull();
      });
    });

    // 2段階の確認そのものは DeleteMasterButton のテストが持つ。ここは配線だけを見る
    it("参照0件のアーカイブ済み行だけを物理削除へ配線する", async () => {
      renderTable({
        archived: [
          section(8, "旧セクションA", "03:00", { isArchived: true }),
          section(9, "旧セクションB", "04:00", { isArchived: true }),
        ],
        deletableIds: [9],
      });

      expect(within(rowOf("旧セクションA")).queryByRole("button", { name: "削除" })).toBeNull();
      const row = rowOf("旧セクションB");
      fireEvent.click(within(row).getByRole("button", { name: "削除" }));
      fireEvent.click(within(row).getByRole("button", { name: "削除する" }));

      await waitFor(() => {
        expect(deleteSectionAction).toHaveBeenCalledExactlyOnceWith(9);
      });
    });

    it("削除の失敗（競合で参照が生まれた等）はメッセージで知らせる（§4.1「競合時」）", async () => {
      vi.mocked(deleteSectionAction).mockResolvedValue({
        ok: false,
        message: "参照しているデータがあるため削除できません",
      });
      renderTable({
        archived: [section(9, "旧セクション", "03:00", { isArchived: true })],
        deletableIds: [9],
      });
      const row = rowOf("旧セクション");

      fireEvent.click(within(row).getByRole("button", { name: "削除" }));
      fireEvent.click(within(row).getByRole("button", { name: "削除する" }));

      await waitFor(() => {
        expect(screen.getByText("参照しているデータがあるため削除できません")).not.toBeNull();
      });
    });
  });
});
