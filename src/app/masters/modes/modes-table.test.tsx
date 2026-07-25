import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MODE_COLORS, type Mode } from "@/domain/mode/mode";
import type { ActionResult } from "../_lib/action-result";

// Server Action の先は実DB接続と revalidatePath に届くため、同じ返り値の契約
// （ActionResult）を返す偽物へ差し替える（アーキテクチャ定義書 §8「偽物を置いてよい境界」）
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

const RED = MODE_COLORS[0];
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

const rowOf = (name: string): HTMLElement => {
  const row = screen.getByText(name).closest("tr");
  if (row === null) throw new Error(`「${name}」の行が見つかりません`);
  return row;
};

const startEditing = (name: string): HTMLInputElement => {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name }));
  return screen.getByDisplayValue(name);
};

/** カラーバーを押してプリセット選択を開く */
const openColorPicker = (row: HTMLElement, currentColorName: string) =>
  fireEvent.click(within(row).getByRole("button", { name: `色を変更（現在: ${currentColorName}）` }));

/** 解決の時点をテストが握る Server Action の偽物 */
function deferred() {
  let resolve!: (result: ActionResult) => void;
  const promise = new Promise<ActionResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createModeAction).mockResolvedValue({ ok: true });
  vi.mocked(updateModeAction).mockResolvedValue({ ok: true });
  vi.mocked(setModeArchivedAction).mockResolvedValue({ ok: true });
  vi.mocked(deleteModeAction).mockResolvedValue({ ok: true });
});

describe("ModesTable（画面定義書03 §3.2: 色はプリセット13色・バーの横に色名を併記）", () => {
  it("行ごとにカラーバーと色名を併記する", () => {
    renderTable();
    const row = rowOf("モードA");

    const bar = within(row)
      .getByRole("button", { name: "色を変更（現在: 赤）" })
      .querySelector("span");
    expect(bar?.style.backgroundColor).toBe("rgb(239, 68, 68)");
    expect(within(row).getByText("赤")).not.toBeNull();
  });

  describe("プリセット色の選択（画面定義書03 §3.2 / 00_共通 §2.1）", () => {
    it("カラーバーを押すとプリセット13色（12色＋グレー）がその場に開く", () => {
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

    it("自由入力は設けない（N-05: 候補から選ぶだけ）", () => {
      renderTable();

      openColorPicker(rowOf("モードA"), "赤");

      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("開くと現在値をハイライトする（00_共通 §2.1）", () => {
      renderTable();

      openColorPicker(rowOf("モードB"), "青");

      expect(screen.getByRole("button", { name: "色 青" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "色 赤" }).getAttribute("aria-pressed")).toBe(
        "false"
      );
    });

    it("候補にマウスを乗せるとその色の名前を吹き出しで出す", () => {
      renderTable();
      openColorPicker(rowOf("モードA"), "赤");
      const swatch = screen.getByRole("button", { name: "色 ライム" });

      fireEvent.mouseEnter(swatch);
      expect(screen.getByRole("tooltip").textContent).toBe("ライム");

      fireEvent.mouseLeave(swatch);
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("キーボードで候補へ移っても色名を吹き出しで出す（N-04）", () => {
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

      fireEvent.click(screen.getByRole("button", { name: "色 グレー" }));

      await waitFor(() => {
        expect(updateModeAction).toHaveBeenCalledExactlyOnceWith(1, {
          name: "モードA",
          color: GRAY,
        });
      });
      expect(screen.queryByRole("button", { name: "色 グレー" })).toBeNull();
    });

    it("Esc で閉じる（送信しない。00_共通 §2.1「閉じ方」）", () => {
      renderTable();
      openColorPicker(rowOf("モードA"), "赤");

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByRole("button", { name: "色 赤" })).toBeNull();
      expect(updateModeAction).not.toHaveBeenCalled();
    });

    it("外側のクリックで閉じる（送信しない。00_共通 §2.1「閉じ方」）", () => {
      renderTable();
      openColorPicker(rowOf("モードA"), "赤");

      fireEvent.mouseDown(document.body);

      expect(screen.queryByRole("button", { name: "色 赤" })).toBeNull();
      expect(updateModeAction).not.toHaveBeenCalled();
    });
  });

  describe("インライン編集（画面定義書03 §4「編集方式」/ 00_共通 §2.3）", () => {
    it("名前セルをクリックするとその場が入力欄になる", () => {
      renderTable();

      const input = startEditing("モードA");

      expect(input.tagName).toBe("INPUT");
    });

    it("変更なしの確定は何も送信せず閉じる", async () => {
      renderTable();
      const input = startEditing("モードA");

      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "モードA" })).not.toBeNull();
      });
      expect(updateModeAction).not.toHaveBeenCalled();
    });

    it("フォーカスが外れたときに確定し、色は現在値のまま送る（§4「行の全項目をまとめて送る」）", async () => {
      renderTable();
      const input = startEditing("モードB");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateModeAction).toHaveBeenCalledExactlyOnceWith(2, {
          name: "改名後",
          color: BLUE,
        });
      });
    });

    it("Enter でも確定する（入力欄を抜けて blur の経路に合流する）", async () => {
      renderTable();
      const input = startEditing("モードA");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(updateModeAction).toHaveBeenCalledExactlyOnceWith(1, { name: "改名後", color: RED });
      });
    });

    it("Esc は元の値に戻して閉じる（送信しない）", async () => {
      renderTable();
      const input = startEditing("モードA");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "モードA" })).not.toBeNull();
      });
      expect(updateModeAction).not.toHaveBeenCalled();
    });

    it("保存中は同じ行の他のセル（名前・色）を触らせない", async () => {
      const pending = deferred();
      vi.mocked(setModeArchivedAction).mockReturnValue(pending.promise);
      renderTable();

      fireEvent.click(within(rowOf("モードA")).getByRole("button", { name: "アーカイブ" }));

      const row = rowOf("モードA");
      await waitFor(() => {
        expect(within(row).getByRole("button", { name: "モードA" })).toHaveProperty(
          "disabled",
          true
        );
      });
      expect(within(row).getByRole("button", { name: "色を変更（現在: 赤）" })).toHaveProperty(
        "disabled",
        true
      );

      await act(async () => {
        pending.resolve({ ok: true });
      });
      expect(within(rowOf("モードA")).getByRole("button", { name: "モードA" })).toHaveProperty(
        "disabled",
        false
      );
    });

    it("失敗したらメッセージを出し、編集状態のまま残す（入力し直せる）", async () => {
      vi.mocked(updateModeAction).mockResolvedValue({
        ok: false,
        message: "名前は50文字以内で入力してください",
      });
      renderTable();
      const input = startEditing("モードA");

      fireEvent.change(input, { target: { value: "あ".repeat(51) } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText("名前は50文字以内で入力してください")).not.toBeNull();
      });
      expect(screen.getByDisplayValue("あ".repeat(51))).toBe(input);
      expect(screen.queryByRole("button", { name: "モードA" })).toBeNull();
    });

    it("次の編集を始めるとエラー表示を消す", async () => {
      vi.mocked(updateModeAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderTable();
      const input = startEditing("モードA");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      await waitFor(() => {
        expect(screen.getByText("名前を入力してください")).not.toBeNull();
      });

      fireEvent.click(within(rowOf("モードB")).getByRole("button", { name: "モードB" }));

      expect(screen.queryByText("名前を入力してください")).toBeNull();
    });
  });

  describe("新規追加", () => {
    it("既定色は先頭のプリセット（赤）で、名前と色を1行で入力する", () => {
      renderTable();

      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      expect(screen.getByPlaceholderText("モード名")).not.toBeNull();
      expect(screen.getByRole("button", { name: "色を選択（現在: 赤）" })).not.toBeNull();
    });

    it("新規行の色選択はまだ送信せず、「保存」でまとめて送る", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.click(screen.getByRole("button", { name: "色を選択（現在: 赤）" }));
      fireEvent.click(screen.getByRole("button", { name: "色 青" }));
      expect(createModeAction).not.toHaveBeenCalled();
      expect(updateModeAction).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "色を選択（現在: 青）" })).not.toBeNull();

      fireEvent.change(screen.getByPlaceholderText("モード名"), { target: { value: "新モード" } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(createModeAction).toHaveBeenCalledExactlyOnceWith({ name: "新モード", color: BLUE });
      });
    });

    it("成功したら新規行を閉じる（保存の完了を待って反映する。§1）", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("モード名"), { target: { value: "新モード" } });

      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("モード名")).toBeNull();
      });
    });

    it("Enter でも追加を送る（新規行は blur 経路を通らない）", async () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      const input = screen.getByPlaceholderText("モード名");

      fireEvent.change(input, { target: { value: "新モード" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(createModeAction).toHaveBeenCalledExactlyOnceWith({ name: "新モード", color: RED });
      });
    });

    it("「取消」で新規行を捨てる（送信しない）", () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.change(screen.getByPlaceholderText("モード名"), { target: { value: "書きかけ" } });

      fireEvent.click(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByPlaceholderText("モード名")).toBeNull();
      expect(createModeAction).not.toHaveBeenCalled();
    });

    it("Esc でも新規行を捨てる", () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      fireEvent.keyDown(screen.getByPlaceholderText("モード名"), { key: "Escape" });

      expect(screen.queryByPlaceholderText("モード名")).toBeNull();
      expect(createModeAction).not.toHaveBeenCalled();
    });

    it("「保存」の押下は入力欄の blur より先に拾う（mousedown の既定動作を抑止して二重送信を防ぐ）", () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      // preventDefault されると fireEvent は false を返す（＝入力欄はフォーカスを失わない）
      expect(fireEvent.mouseDown(screen.getByRole("button", { name: "保存" }))).toBe(false);
    });

    it("開くたびに既定色へ戻す（前回の選択を持ち越さない）", () => {
      renderTable();
      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));
      fireEvent.click(screen.getByRole("button", { name: "色を選択（現在: 赤）" }));
      fireEvent.click(screen.getByRole("button", { name: "色 青" }));
      fireEvent.click(screen.getByRole("button", { name: "取消" }));

      fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

      expect(screen.getByRole("button", { name: "色を選択（現在: 赤）" })).not.toBeNull();
    });
  });

  describe("アーカイブと物理削除（画面定義書03 §4 / §4.1）", () => {
    it("「アーカイブ」はアーカイブ済みへ移す（物理削除はしない）", async () => {
      renderTable();

      fireEvent.click(within(rowOf("モードA")).getByRole("button", { name: "アーカイブ" }));

      await waitFor(() => {
        expect(setModeArchivedAction).toHaveBeenCalledExactlyOnceWith(1, true);
      });
      expect(deleteModeAction).not.toHaveBeenCalled();
    });

    it("アーカイブ済みも色名を添えて出し、「復元」で有効へ戻す", async () => {
      renderTable({ active: [], archived: [mode(9, "旧モード", GRAY, true)] });
      const row = rowOf("旧モード");

      expect(within(row).getByText("グレー")).not.toBeNull();
      fireEvent.click(within(row).getByRole("button", { name: "復元" }));

      await waitFor(() => {
        expect(setModeArchivedAction).toHaveBeenCalledExactlyOnceWith(9, false);
      });
    });

    it("参照0件のアーカイブ済み行だけを2段階の確認で物理削除できる", async () => {
      renderTable({
        active: [],
        archived: [mode(8, "旧モードA", RED, true), mode(9, "旧モードB", GRAY, true)],
        deletableIds: [9],
      });

      expect(within(rowOf("旧モードA")).queryByRole("button", { name: "削除" })).toBeNull();
      const row = rowOf("旧モードB");
      fireEvent.click(within(row).getByRole("button", { name: "削除" }));
      fireEvent.click(within(row).getByRole("button", { name: "削除する" }));

      await waitFor(() => {
        expect(deleteModeAction).toHaveBeenCalledExactlyOnceWith(9);
      });
    });

    it("削除の失敗（競合で参照が生まれた等）はメッセージで知らせる（§4.1「競合時」）", async () => {
      vi.mocked(deleteModeAction).mockResolvedValue({
        ok: false,
        message: "参照しているデータがあるため削除できません",
      });
      renderTable({ active: [], archived: [mode(9, "旧モード", GRAY, true)], deletableIds: [9] });
      const row = rowOf("旧モード");

      fireEvent.click(within(row).getByRole("button", { name: "削除" }));
      fireEvent.click(within(row).getByRole("button", { name: "削除する" }));

      await waitFor(() => {
        expect(screen.getByText("参照しているデータがあるため削除できません")).not.toBeNull();
      });
    });
  });
});
