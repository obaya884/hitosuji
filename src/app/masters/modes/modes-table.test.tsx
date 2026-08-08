import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MODE_COLOR_PRESETS, type Mode } from "@/domain/mode/mode";

import { deferredAction } from "@/app/_testing/actions";
import { rgbOf } from "@/app/_testing/dom";
import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { rowOf, startEditingCell } from "../_testing/table-helpers";

// Server Action の先は実DB接続と revalidatePath に届くため、同じ返り値の契約
// （ActionResult）を返す偽物へ差し替える（テスト戦略定義書 §2「偽物を置いてよい境界」）
vi.mock("./actions", () => ({
  createModeAction: vi.fn(),
  updateModeAction: vi.fn(),
  setModeArchivedAction: vi.fn(),
  deleteModeAction: vi.fn(),
}));

import {
  createModeAction,
  deleteModeAction,
  setModeArchivedAction,
  updateModeAction,
} from "./actions";
import { ModesTable } from "./modes-table";

// プリセット13色のうちテストで使う3つ（画面定義書03 §3.2 の表の値）。
// 添字（MODE_COLOR_PRESETS[0].value 等）ではなく hex を直に置き、期待値の色名（「赤」等）と読み合わせられるようにする
const RED = "#ef4444";
const BLUE = "#3b82f6";
const GRAY = "#9ca3af";

const mode = (id: number, name: string, color: string, isArchived = false): Mode => ({
  id,
  name,
  color,
  isArchived,
});

const ACTIVE = [mode(1, "モードA", RED), mode(2, "モードB", BLUE)] as const;

function renderTable(
  props: Partial<{
    active: readonly Mode[];
    archived: readonly Mode[];
    deletableIds: readonly number[];
  }> = {}
) {
  return render(
    <ModesTable
      active={props.active ?? ACTIVE}
      archived={props.archived ?? []}
      deletableIds={props.deletableIds ?? []}
    />
  );
}

/** カラーバーを押してプリセット選択を開く（開くだけなのでサーバへは届かない） */
const openColorPicker = (row: HTMLElement, currentColorName: string): void =>
  clickWithoutServer(
    within(row).getByRole("button", { name: `色を変更（現在: ${currentColorName}）` })
  );

/** 開いているプリセット選択のパネル（候補の外へ検索が漏れないよう、ここへ絞って主張する） */
const colorPickerPanel = (): HTMLElement => {
  const panel = screen.getByRole("button", { name: "色 赤" }).closest("div");
  if (panel === null) throw new Error("プリセット選択が開いていません");
  return panel;
};

beforeEach(() => {
  vi.mocked(createModeAction).mockResolvedValue({ ok: true });
  vi.mocked(updateModeAction).mockResolvedValue({ ok: true });
  vi.mocked(setModeArchivedAction).mockResolvedValue({ ok: true });
  vi.mocked(deleteModeAction).mockResolvedValue({ ok: true });
});

describe("ModesTable（画面定義書03 §3.2: 色はプリセット13色・バーの横に色名を併記）", () => {
  // 説明文は共通の外枠（TableFrame）へ prop で渡すので、表ごとに渡し違えていないかを見る（T-79）
  it("色の決め方と並び順を説明文で伝える（§3.2）", () => {
    renderTable();

    expect(screen.getByText(/色はプリセットから選択します/)).not.toBeNull();
  });

  it("行ごとにカラーバーと色名を併記する", () => {
    renderTable();
    const row = rowOf("モードA");

    const bar = within(row)
      .getByRole("button", { name: "色を変更（現在: 赤）" })
      .querySelector("span");
    expect(bar?.style.backgroundColor).toBe(rgbOf(RED));
    expect(within(row).getByText("赤")).not.toBeNull();
  });

  // このピッカーに 00_共通 §2.1 のどの項目が及ぶかは画面定義書03 §3.2 が正（FB-59）
  describe("プリセット色の選択（画面定義書03 §3.2）", () => {
    it("カラーバーを押すとプリセット13色（12色＋グレー）がその場に開く", async () => {
      renderTable();

      openColorPicker(rowOf("モードA"), "赤");

      const swatches = screen.getAllByRole("button", { name: /^色 / });
      expect(swatches.map((b) => b.getAttribute("aria-label"))).toEqual([
        "色 赤",
        "色 オレンジ",
        "色 琥珀",
        "色 黄",
        "色 ライム",
        "色 緑",
        "色 ティール",
        "色 シアン",
        "色 青",
        "色 インディゴ",
        "色 紫",
        "色 ピンク",
        "色 グレー",
      ]);
    });

    it("自由入力は設けない（N-05: 開いたパネルは候補だけで入力欄を持たない）", async () => {
      renderTable();

      openColorPicker(rowOf("モードA"), "赤");

      const panel = colorPickerPanel();
      expect(within(panel).queryByRole("textbox")).toBeNull();
      expect(within(panel).getAllByRole("button")).toHaveLength(MODE_COLOR_PRESETS.length);
    });

    // ラベル（色名）と塗り（色値）が同じプリセットの1件から出ていることを画面段で固定する
    it("候補は色名に対応する色値で塗られる", async () => {
      renderTable();

      openColorPicker(rowOf("モードA"), "赤");

      for (const { value, name } of MODE_COLOR_PRESETS) {
        const swatch = screen.getByRole("button", { name: `色 ${name}` });
        expect(swatch.style.backgroundColor).toBe(rgbOf(value));
      }
    });

    it("開くと現在値を輪郭で示す（画面定義書03 §3.2）", async () => {
      renderTable();

      openColorPicker(rowOf("モードB"), "青");

      // 輪郭は面色と違い role や aria では読めないので classList で見る
      // （`select-popover.test.tsx` のハイライト判定と同じ流儀）
      expect(screen.getByRole("button", { name: "色 青" }).classList.contains("outline-ink")).toBe(
        true
      );
      expect(screen.getByRole("button", { name: "色 赤" }).classList.contains("outline-ink")).toBe(
        false
      );
    });

    it("現在値を読み上げにも出す（`aria-pressed`）", async () => {
      renderTable();

      openColorPicker(rowOf("モードB"), "青");

      expect(screen.getByRole("button", { name: "色 青" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "色 赤" }).getAttribute("aria-pressed")).toBe(
        "false"
      );
    });

    it("候補にマウスを乗せるとその色の名前を吹き出しで出す", async () => {
      renderTable();
      openColorPicker(rowOf("モードA"), "赤");
      const swatch = screen.getByRole("button", { name: "色 ライム" });

      fireEvent.mouseEnter(swatch);
      expect(screen.getByRole("tooltip").textContent).toBe("ライム");

      fireEvent.mouseLeave(swatch);
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("キーボードで候補へ移っても色名を吹き出しで出す（マウスを使わなくても色名が読める）", async () => {
      renderTable();
      openColorPicker(rowOf("モードA"), "赤");
      const swatch = screen.getByRole("button", { name: "色 ティール" });

      fireEvent.focus(swatch);
      expect(screen.getByRole("tooltip").textContent).toBe("ティール");

      fireEvent.blur(swatch);
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("色を選ぶと即保存し（名前は現在値のまま送る）ポップオーバーを閉じる", async () => {
      renderTable();
      openColorPicker(rowOf("モードA"), "赤");

      await click(screen.getByRole("button", { name: "色 グレー" }));

      expect(updateModeAction).toHaveBeenCalledExactlyOnceWith(1, {
        name: "モードA",
        color: GRAY,
      });
      expect(screen.queryByRole("button", { name: "色 グレー" })).toBeNull();
    });

    it("Esc で閉じる（送信しない。00_共通 §2.1「閉じ方」）", async () => {
      renderTable();
      openColorPicker(rowOf("モードA"), "赤");

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByRole("button", { name: "色 赤" })).toBeNull();
      expect(updateModeAction).not.toHaveBeenCalled();
    });

    it("外側のクリックで閉じる（送信しない。00_共通 §2.1「閉じ方」）", async () => {
      renderTable();
      openColorPicker(rowOf("モードA"), "赤");

      fireEvent.mouseDown(document.body);

      expect(screen.queryByRole("button", { name: "色 赤" })).toBeNull();
      expect(updateModeAction).not.toHaveBeenCalled();
    });
  });

  describe("インライン編集（画面定義書03 §4「編集方式」/ 00_共通 §2.3）", () => {
    it("フォーカスが外れたときに確定し、色は現在値のまま送る（§4「行の全項目をまとめて送る」）", async () => {
      renderTable();
      const input = startEditingCell("モードB");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateModeAction).toHaveBeenCalledExactlyOnceWith(2, {
          name: "改名後",
          color: BLUE,
        });
      });
    });

    // 抑止そのものは部品（MasterEditableCell）が持つ。ここで見るのは表が `isPending` を
    // セルへ渡していることと、表の JSX が持つカラーバー・操作ボタン側の抑止（§6 の②）
    it("保存中は行の編集セル・カラーバー・操作ボタンを押せない", async () => {
      const pending = deferredAction();
      vi.mocked(setModeArchivedAction).mockReturnValue(pending.promise);
      renderTable();

      await click(within(rowOf("モードA")).getByRole("button", { name: "アーカイブ" }));

      const row = rowOf("モードA");
      const nameCell = within(row).getByRole("button", { name: "モードA" });
      expect(nameCell).toHaveProperty("disabled", true);
      expect(within(row).getByRole("button", { name: "色を変更（現在: 赤）" })).toHaveProperty(
        "disabled",
        true
      );
      expect(within(row).getByRole("button", { name: "アーカイブ" })).toHaveProperty(
        "disabled",
        true
      );
      // 押しても開かない（古い値を再送しうる経路が閉じている）
      await click(nameCell);
      expect(screen.queryByDisplayValue("モードA")).toBeNull();

      await act(async () => {
        pending.resolve({ ok: true });
      });
      expect(within(rowOf("モードA")).getByRole("button", { name: "モードA" })).toHaveProperty(
        "disabled",
        false
      );
    });

    // onClose が表の editingId を落としているか（§6 の②「部品のコールバック → 画面の状態」）。
    // Esc の挙動そのものは master-editable-cell.test.tsx が持つ
    it("Esc でセルが閉じ、元の表示に戻る", async () => {
      renderTable();
      const input = startEditingCell("モードA");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "モードA" })).not.toBeNull();
      });
      expect(updateModeAction).not.toHaveBeenCalled();
    });

    it("失敗したらメッセージを出し、編集状態のまま残す（入力し直せる）", async () => {
      const message = "対象が見つかりません（すでに削除されている可能性があります）";
      vi.mocked(updateModeAction).mockResolvedValue({ ok: false, message });
      renderTable();
      const input = startEditingCell("モードA");

      // フィクスチャの別行と同名にしない（行を文言で引く契約なので、静かに別行を掴む）
      fireEvent.change(input, { target: { value: "モードA改" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(message)).not.toBeNull();
      });
      expect(screen.getByDisplayValue("モードA改")).toBe(input);
      expect(screen.queryByRole("button", { name: "モードA" })).toBeNull();
    });

    it("次の編集を始めるとエラー表示を消す", async () => {
      vi.mocked(updateModeAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderTable();
      const input = startEditingCell("モードA");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      // メッセージの表示と isPending の解除は別のタイミングで届く。§2.3 が要求するのは
      // 「同じ行」の抑止だが、実装は isPending を表ごとに1つ持つので他行のセルも止まる。
      // そのため押せる状態に戻るまで待ってからでないと click が無視される
      const otherCell = await waitFor(() => {
        expect(screen.getByText("名前を入力してください")).not.toBeNull();
        const cell = within(rowOf("モードB")).getByRole("button", { name: "モードB" });
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
      vi.mocked(updateModeAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderTable();
      const input = startEditingCell("モードA");
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

    it("既定色は先頭のプリセット（赤）で、名前と色を1行で入力する", async () => {
      renderTable();

      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

      expect(screen.getByPlaceholderText("モード名")).not.toBeNull();
      expect(screen.getByRole("button", { name: "色を選択（現在: 赤）" })).not.toBeNull();
    });

    it("新規行の色選択はまだ送信せず、「保存」でまとめて送る", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

      clickWithoutServer(screen.getByRole("button", { name: "色を選択（現在: 赤）" }));
      clickWithoutServer(screen.getByRole("button", { name: "色 青" }));
      expect(createModeAction).not.toHaveBeenCalled();
      expect(updateModeAction).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "色を選択（現在: 青）" })).not.toBeNull();

      fireEvent.change(screen.getByPlaceholderText("モード名"), { target: { value: "新モード" } });
      await click(screen.getByRole("button", { name: "保存" }));

      expect(createModeAction).toHaveBeenCalledExactlyOnceWith({ name: "新モード", color: BLUE });
    });

    it("成功したら新規行を閉じる（保存の完了を待って反映する。§1）", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("モード名"), { target: { value: "新モード" } });

      await click(screen.getByRole("button", { name: "保存" }));

      expect(screen.queryByPlaceholderText("モード名")).toBeNull();
    });

    // onCancel が表の editing を落としているか（§6 の②）。取消・Esc の挙動そのものは
    // master-new-row.test.tsx が持つので、ここは行が消えることだけを見る
    it("「取消」で新規行が消える（送信しない）", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("モード名"), { target: { value: "書きかけ" } });

      clickWithoutServer(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByPlaceholderText("モード名")).toBeNull();
      expect(createModeAction).not.toHaveBeenCalled();
    });

    // 応答を自分で解くのは、抑止が解けたことを見るため——即解決のモックだと抑止が掛かった
    // 瞬間を観測できず、「解けた」と「そもそも抑止されなかった」を区別できない
    it("追加の失敗はメッセージで知らせ、新規行を残す（00_共通 §2.3「失敗時」）", async () => {
      const pending = deferredAction();
      vi.mocked(createModeAction).mockReturnValue(pending.promise);
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("モード名"), { target: { value: "新モード" } });

      await click(screen.getByRole("button", { name: "保存" }));

      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);

      // 解決も act の中で流し切るので、以降は同期に見てよい
      await act(async () => {
        pending.resolve({ ok: false, message: "色はプリセットから選択してください" });
      });

      expect(screen.getByText("色はプリセットから選択してください")).not.toBeNull();
      expect(screen.getByPlaceholderText("モード名")).not.toBeNull();
      // 抑止が解けたままにならない＝入力し直して保存できる（§2.3「失敗時」）
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", false);
      expect(screen.getByRole("button", { name: "取消" })).toHaveProperty("disabled", false);
    });

    // 表が `isPending` を TableFrame へ渡しているか（§6 の②）。押せると開いていたセルが閉じる
    it("保存中は「新規追加」を押せない", async () => {
      const pending = deferredAction();
      vi.mocked(setModeArchivedAction).mockReturnValue(pending.promise);
      renderTable();

      await click(within(rowOf("モードA")).getByRole("button", { name: "アーカイブ" }));

      const create = screen.getByRole("button", { name: "新規追加" });
      expect(create).toHaveProperty("disabled", true);
      await click(create);
      expect(screen.queryByPlaceholderText("モード名")).toBeNull();

      await act(async () => {
        pending.resolve({ ok: true });
      });
      expect(screen.getByRole("button", { name: "新規追加" })).toHaveProperty("disabled", false);
    });

    // 送信せず表示だけを変えるその場の選択も止める（§2.3）——送る値と表示が食い違うため
    it("保存中は新規行の色スウォッチを押せない", async () => {
      const pending = deferredAction();
      vi.mocked(createModeAction).mockReturnValue(pending.promise);
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("モード名"), { target: { value: "新モード" } });

      await click(screen.getByRole("button", { name: "保存" }));

      const swatch = screen.getByRole("button", { name: "色を選択（現在: 赤）" });
      expect(swatch).toHaveProperty("disabled", true);
      await click(swatch);
      expect(screen.queryByRole("button", { name: "色 青" })).toBeNull();

      // 成功すると新規行ごと閉じるので、他のテストと違い解除側は主張できない（act 警告を避けて終える）
      await act(async () => {
        pending.resolve({ ok: true });
      });
    });

    it("開くたびに既定色へ戻す（前回の選択を持ち越さない）", async () => {
      renderTable();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      clickWithoutServer(screen.getByRole("button", { name: "色を選択（現在: 赤）" }));
      clickWithoutServer(screen.getByRole("button", { name: "色 青" }));
      clickWithoutServer(screen.getByRole("button", { name: "取消" }));

      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

      expect(screen.getByRole("button", { name: "色を選択（現在: 赤）" })).not.toBeNull();
    });
  });

  describe("アーカイブと物理削除（画面定義書03 §4 / §4.1）", () => {
    it("「アーカイブ」はアーカイブ済みへ移す（物理削除はしない）", async () => {
      renderTable();

      await click(within(rowOf("モードA")).getByRole("button", { name: "アーカイブ" }));

      expect(setModeArchivedAction).toHaveBeenCalledExactlyOnceWith(1, true);
      expect(deleteModeAction).not.toHaveBeenCalled();
    });

    it("アーカイブの失敗（別タブで対象が消えた等）はメッセージで知らせる", async () => {
      vi.mocked(setModeArchivedAction).mockResolvedValue({
        ok: false,
        message: "対象が見つかりません（すでに削除されている可能性があります）",
      });
      renderTable();

      await click(within(rowOf("モードA")).getByRole("button", { name: "アーカイブ" }));

      expect(screen.getByText("対象が見つかりません（すでに削除されている可能性があります）")).not.toBeNull();
    });

    it("アーカイブ済みも色名を添えて出し、「復元」で有効へ戻す", async () => {
      renderTable({ active: [], archived: [mode(9, "旧モード", GRAY, true)] });
      const row = rowOf("旧モード");

      expect(within(row).getByText("グレー")).not.toBeNull();
      await click(within(row).getByRole("button", { name: "復元" }));

      expect(setModeArchivedAction).toHaveBeenCalledExactlyOnceWith(9, false);
    });

    // 2段階の確認そのものは DeleteMasterButton のテストが持つ。ここは配線だけを見る
    it("参照0件のアーカイブ済み行だけを物理削除へ配線する", async () => {
      renderTable({
        active: [],
        archived: [mode(8, "旧モードA", RED, true), mode(9, "旧モードB", GRAY, true)],
        deletableIds: [9],
      });

      expect(within(rowOf("旧モードA")).queryByRole("button", { name: "削除" })).toBeNull();
      const row = rowOf("旧モードB");
      clickWithoutServer(within(row).getByRole("button", { name: "削除" }));
      await click(within(row).getByRole("button", { name: "削除する" }));

      expect(deleteModeAction).toHaveBeenCalledExactlyOnceWith(9);
    });
  });
});
