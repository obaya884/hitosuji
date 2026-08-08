import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/domain/section/section";

import { deferredAction } from "@/app/_testing/actions";
import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { rowOf, startEditingCell } from "../_testing/table-helpers";

// Server Action の先は実DB接続と revalidatePath に届くため、同じ返り値の契約
// （ActionResult）を返す偽物へ差し替える（テスト戦略定義書 §2「偽物を置いてよい境界」）
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
  clickWithoutServer(within(rowOf(name)).getByRole("button", { name: `${startTime}–${endTime}` }));
  return screen.getByDisplayValue<HTMLInputElement>(startTime);
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

  describe("枠の長さ（画面定義書03 §3.1「長さ」/ FB-90）", () => {
    it("「長さ」列を時間帯の右に置く", () => {
      renderTable();

      // 列名と位置の両方が §3.1 の定め（末尾の空欄は操作列）
      expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
        "日界",
        "名前",
        "時間帯",
        "長さ",
        "",
      ]);
    });

    it("各行に枠の長さを H:MM で出す", () => {
      renderTable();

      expect(within(rowOf("セクションA")).getByText("6:00")).not.toBeNull();
      // 日をまたぐ枠（12:00–06:00）も24時間の巡回で測る
      expect(within(rowOf("セクションB")).getByText("18:00")).not.toBeNull();
    });

    it("有効セクションが1件なら丸1日（24:00）になる", () => {
      renderTable({ ranges: [section(1, "終日", "06:00", { endTime: "06:00", isDayStart: true })] });

      expect(within(rowOf("終日")).getByText("24:00")).not.toBeNull();
    });

    // 導出値なので編集に入らない（開始時刻セルと違い、押しても入力欄にならない）
    it("長さは読み取り専用（セルがボタンになっていない）", () => {
      renderTable();

      expect(within(rowOf("セクションA")).queryByRole("button", { name: "6:00" })).toBeNull();
    });
  });

  describe("日界セクションの選択（F-116 / 画面定義書03 §3.1）", () => {
    it("ちょうど1行が選択された状態で示す", () => {
      renderTable();

      expect(screen.getByLabelText("セクションAを1日の開始にする")).toHaveProperty("checked", true);
      expect(screen.getByLabelText("セクションBを1日の開始にする")).toHaveProperty("checked", false);
    });

    // §3.1 は行内にラベル文字列を置かない代わりに、列見出しと一覧上部の説明文へ
    // 「このラジオが何を選ぶものか」を負わせている（FB-62）。どちらも消えると意味が読めなくなる
    it("ラジオの意味を列見出しと説明文で伝える", () => {
      renderTable();

      expect(screen.getByRole("columnheader", { name: "日界" })).not.toBeNull();
      expect(screen.getByText(/先頭のラジオで「1日の開始（日界）」/)).not.toBeNull();
    });

    it("行内にはラベル文字列を置かない（示すのは選択状態だけ）", () => {
      renderTable();

      // `aria-label` は属性なので `queryByText` には掛からない（行内の文字列だけを見ている）
      expect(within(rowOf("セクションA")).queryByText("1日の開始")).toBeNull();
    });

    it("ラジオを切り替えると日界をその行へ移す", async () => {
      renderTable();

      await click(screen.getByLabelText("セクションBを1日の開始にする"));

      expect(setDayStartSectionAction).toHaveBeenCalledExactlyOnceWith(2);
    });

    it("日界切替の失敗はメッセージで知らせる（別タブで対象が消えた等）", async () => {
      vi.mocked(setDayStartSectionAction).mockResolvedValue({
        ok: false,
        message: "対象が見つかりません（すでに削除されている可能性があります）",
      });
      renderTable();

      await click(screen.getByLabelText("セクションBを1日の開始にする"));

      expect(screen.getByText("対象が見つかりません（すでに削除されている可能性があります）")).not.toBeNull();
    });

    it("日界セクションはアーカイブできない（先に別セクションを日界に指定させる）", async () => {
      renderTable();

      const archive = within(rowOf("セクションA")).getByRole("button", { name: "アーカイブ" });
      expect(archive).toHaveProperty("disabled", true);
      expect(archive.getAttribute("title")).toBe("日界セクションはアーカイブできません");

      await click(archive);
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
      await click(archive);

      expect(archiveSectionAction).toHaveBeenCalledExactlyOnceWith(2);
    });

    // 「有効セクション最低1件」はボタンの非活性では防げず（残り1件かは画面から分からない）、
    // サーバ側の再判定でしか出ない。§4.1「競合時」と同型で、文言が画面へ届く唯一の経路
    it("アーカイブの失敗（有効セクション最低1件）はメッセージで知らせる（§3.1）", async () => {
      vi.mocked(archiveSectionAction).mockResolvedValue({
        ok: false,
        message: "有効なセクションは最低1件必要です",
      });
      renderTable();

      await click(within(rowOf("セクションB")).getByRole("button", { name: "アーカイブ" }));

      expect(screen.getByText("有効なセクションは最低1件必要です")).not.toBeNull();
    });
  });

  describe("インライン編集（画面定義書03 §4「編集方式」/ 00_共通 §2.3）", () => {
    it("名前セルと開始時刻セルは独立して編集できる（一方だけが入力欄になる）", async () => {
      renderTable();

      startEditingCell("セクションA");

      const row = rowOf("06:00–12:00");
      expect(within(row).getByRole("button", { name: "06:00–12:00" })).not.toBeNull();
      expect(screen.getAllByRole("textbox")).toHaveLength(1);
    });

    it("開始時刻の編集中も終了時刻は導出値のまま出す（編集できるのは開始のみ）", async () => {
      renderTable();

      const input = startEditingStartTime("セクションA", "06:00", "12:00");

      expect(input.type).toBe("time");
      const derived = screen.getByTitle("次のセクションの開始時刻から自動導出");
      expect(derived.textContent).toBe("–12:00");
      expect(derived.tagName).not.toBe("INPUT");
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

    // 抑止そのものは部品（MasterEditableCell）が持つ。ここで見るのは表が `isPending` を
    // **2つのセルそれぞれへ**渡していることと、表の JSX が持つ日界ラジオ・操作ボタンの抑止（§6 の②）
    it("保存中は行の両方のセル・日界ラジオ・操作ボタンを押せない", async () => {
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
      // 名前セルは確定して閉じたあとなので、別行（セクションB）の名前セルで抑止を見る
      expect(within(rowOf("セクションB")).getByRole("button", { name: "セクションB" })).toHaveProperty(
        "disabled",
        true
      );
      // 日界セクションなので元から押せない。保存中の抑止を見たいので非日界の行で見る
      expect(
        within(rowOf("セクションB")).getByRole("button", { name: "アーカイブ" })
      ).toHaveProperty("disabled", true);

      await act(async () => {
        pending.resolve({ ok: true });
      });
      // 保存が返ると名前セルが入力欄からボタンへ戻るので、ここからは名前で引ける
      expect(
        within(rowOf("セクションA")).getByLabelText("セクションAを1日の開始にする")
      ).toHaveProperty("disabled", false);
    });

    // onClose が表の editing を落としているか（§6 の②）。開始時刻セルは display 付き
    // （`06:00–12:00` の枠表示）なので、閉じたときに枠表示へ戻ることまで見る
    it("Esc で開始時刻セルが閉じ、導出込みの枠表示に戻る", async () => {
      renderTable();
      const input = startEditingStartTime("セクションA", "06:00", "12:00");
      fireEvent.change(input, { target: { value: "23:45" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(within(rowOf("セクションA")).getByRole("button", { name: "06:00–12:00" })).not.toBeNull();
      });
      expect(updateSectionAction).not.toHaveBeenCalled();
    });

    it("Esc で名前セルも閉じる（セルごとに別の onClose を配線している）", async () => {
      renderTable();
      const input = startEditingCell("セクションB");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "セクションB" })).not.toBeNull();
      });
      expect(updateSectionAction).not.toHaveBeenCalled();
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
      // メッセージの表示と isPending の解除は別のタイミングで届く。§2.3 が要求するのは
      // 「同じ行」の抑止だが、実装は isPending を表ごとに1つ持つので他行のセルも止まる。
      // そのため押せる状態に戻るまで待ってからでないと click が無視される
      const otherCell = await waitFor(() => {
        expect(screen.getByText("開始時刻を HH:MM 形式で入力してください")).not.toBeNull();
        const cell = within(rowOf("セクションB")).getByRole("button", { name: "セクションB" });
        expect(cell).toHaveProperty("disabled", false);
        return cell;
      });

      await click(otherCell);

      expect(screen.queryByText("開始時刻を HH:MM 形式で入力してください")).toBeNull();
    });
  });

  describe("新規追加", () => {
    // 「新規追加」も次の編集の始まりなので、直前の失敗の帯を消す（表側に残った配線。T-79）
    it("「新規追加」を押すとエラー表示を消す", async () => {
      vi.mocked(updateSectionAction).mockResolvedValue({
        ok: false,
        message: "開始時刻を HH:MM 形式で入力してください",
      });
      renderTable();
      const input = startEditingCell("セクションA");
      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);
      // 保存中は「新規追加」が押せないので、押せる状態に戻るまで待つ
      const addNew = await waitFor(() => {
        expect(screen.getByText("開始時刻を HH:MM 形式で入力してください")).not.toBeNull();
        const button = screen.getByRole("button", { name: "新規追加" });
        expect(button).toHaveProperty("disabled", false);
        return button;
      });

      await click(addNew);

      expect(screen.queryByText("開始時刻を HH:MM 形式で入力してください")).toBeNull();
    });

    it("名前と開始時刻だけを入力し、終了時刻は自動導出であることを示す", async () => {
      renderTable();

      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

      expect(screen.getByPlaceholderText("セクション名")).not.toBeNull();
      expect(screen.getByTitle("次のセクションの開始時刻から自動導出").textContent).toBe("–自動");
      // 日界の選択は保存後に行うため、新規行にラジオは置かない
      expect(screen.getAllByRole("radio")).toHaveLength(RANGES.length);
    });

    // 長さも枠が定まってから決まる＝新規行では空。空セルを置き忘れると以降の列がずれる
    it("長さの列は空のまま置く（列数と位置を見出しにそろえる）", () => {
      renderTable();

      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

      const newRow = screen.getByPlaceholderText("セクション名").closest("tr") as HTMLElement;
      const cells = within(newRow).getAllByRole("cell");
      expect(cells).toHaveLength(screen.getAllByRole("columnheader").length);
      expect(cells[3].textContent).toBe(""); // 4列目＝長さ
    });

    it("「保存」で名前と開始時刻をまとめて送る", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.change(screen.getByPlaceholderText("セクション名"), {
        target: { value: "新セクション" },
      });
      const startTime = document.querySelector<HTMLInputElement>('input[data-field="startTime"]');
      fireEvent.change(startTime as HTMLInputElement, { target: { value: "21:00" } });
      await click(screen.getByRole("button", { name: "保存" }));

      expect(createSectionAction).toHaveBeenCalledExactlyOnceWith({
        name: "新セクション",
        startTime: "21:00",
      });
    });

    it("成功したら新規行を閉じる（保存の完了を待って反映する。§1）", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("セクション名"), {
        target: { value: "新セクション" },
      });

      await click(screen.getByRole("button", { name: "保存" }));

      expect(screen.queryByPlaceholderText("セクション名")).toBeNull();
    });

    // 応答を自分で解くのは、抑止が解けたことを見るため——即解決のモックだと抑止が掛かった
    // 瞬間を観測できず、「解けた」と「そもそも抑止されなかった」を区別できない
    it("追加の失敗はメッセージで知らせ、新規行を残す（00_共通 §2.3「失敗時」）", async () => {
      const pending = deferredAction();
      vi.mocked(createSectionAction).mockReturnValue(pending.promise);
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("セクション名"), {
        target: { value: "新セクション" },
      });

      await click(screen.getByRole("button", { name: "保存" }));

      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);

      // 解決も act の中で流し切るので、以降は同期に見てよい
      await act(async () => {
        pending.resolve({ ok: false, message: "開始時刻を HH:MM 形式で入力してください" });
      });

      expect(screen.getByText("開始時刻を HH:MM 形式で入力してください")).not.toBeNull();
      expect(screen.getByPlaceholderText("セクション名")).not.toBeNull();
      // 抑止が解けたままにならない＝入力し直して保存できる（§2.3「失敗時」）
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", false);
      expect(screen.getByRole("button", { name: "取消" })).toHaveProperty("disabled", false);
    });

    // onCancel が表の editing を落としているか（§6 の②）。取消・Esc の挙動そのものは部品段が持つ
    it("「取消」で新規行が消える（送信しない）", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("セクション名"), {
        target: { value: "書きかけ" },
      });

      clickWithoutServer(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByPlaceholderText("セクション名")).toBeNull();
      expect(createSectionAction).not.toHaveBeenCalled();
    });

    // 表が `isPending` を TableFrame へ渡しているか（§6 の②）。押せると開いていたセルが閉じる
    it("保存中は「新規追加」を押せない", async () => {
      const pending = deferredAction();
      vi.mocked(archiveSectionAction).mockReturnValue(pending.promise);
      renderTable();

      await click(within(rowOf("セクションB")).getByRole("button", { name: "アーカイブ" }));

      const create = screen.getByRole("button", { name: "新規追加" });
      expect(create).toHaveProperty("disabled", true);
      await click(create);
      expect(screen.queryByPlaceholderText("セクション名")).toBeNull();

      await act(async () => {
        pending.resolve({ ok: true });
      });
      expect(screen.getByRole("button", { name: "新規追加" })).toHaveProperty("disabled", false);
    });
  });

  describe("アーカイブと物理削除（画面定義書03 §4 / §4.1）", () => {
    it("アーカイブ済みは開始時刻を添えて出し、「復元」で有効へ戻す", async () => {
      renderTable({ archived: [section(9, "旧セクション", "03:00", { isArchived: true })] });
      const row = rowOf("旧セクション");

      expect(within(row).getByText("03:00")).not.toBeNull();
      // 枠の導出対象外で終了時刻が定まらないため長さは出さない（名前・開始時刻・操作の3列。§3.1）
      expect(within(row).getAllByRole("cell")).toHaveLength(3);
      await click(within(row).getByRole("button", { name: "復元" }));

      expect(restoreSectionAction).toHaveBeenCalledExactlyOnceWith(9);
    });

    it("復元の失敗（開始時刻が他と重複する等）はメッセージで知らせる", async () => {
      vi.mocked(restoreSectionAction).mockResolvedValue({
        ok: false,
        message: "同じ開始時刻の有効なセクションがあります",
      });
      renderTable({ archived: [section(9, "旧セクション", "03:00", { isArchived: true })] });

      await click(within(rowOf("旧セクション")).getByRole("button", { name: "復元" }));

      expect(screen.getByText("同じ開始時刻の有効なセクションがあります")).not.toBeNull();
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
      clickWithoutServer(within(row).getByRole("button", { name: "削除" }));
      await click(within(row).getByRole("button", { name: "削除する" }));

      expect(deleteSectionAction).toHaveBeenCalledExactlyOnceWith(9);
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

      clickWithoutServer(within(row).getByRole("button", { name: "削除" }));
      await click(within(row).getByRole("button", { name: "削除する" }));

      expect(screen.getByText("参照しているデータがあるため削除できません")).not.toBeNull();
    });
  });
});
