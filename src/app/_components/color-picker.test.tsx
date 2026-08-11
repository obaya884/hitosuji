import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COLOR_BY_NAME, COLOR_PRESETS } from "@/domain/shared/color-presets";
import { hasClass, rgbOf } from "@/app/_testing/dom";
import { clickWithoutServer } from "@/app/_testing/interactions";
import { ColorBarButton, ColorPickerPopover } from "./color-picker";

// 色の選び方はモード（S-03）とバンドル（S-05）が共有する部品で決まる（画面定義書03 §3.2 /
// 05 §4 O-1・O-2）。**観点を部品段に置く**——画面側のテストだけに置くと、その画面を整理した
// ときに共有部品の観点ごと落ちる
const RED = COLOR_BY_NAME["赤"];
const BLUE = COLOR_BY_NAME["青"];

function renderPopover(selected: string = RED) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ColorPickerPopover selected={selected} onSelect={onSelect} onClose={onClose} />
  );
  return { ...view, onSelect, onClose };
}

describe("ColorPickerPopover（画面定義書03 §3.2: プリセット13色・自由入力なし）", () => {
  it("プリセットを表の順に並べる（12色＋グレー）", () => {
    renderPopover();

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

  it("自由入力は設けない（N-05: 候補だけで入力欄を持たない）", () => {
    const { container } = renderPopover();

    expect(within(container).queryByRole("textbox")).toBeNull();
    expect(within(container).getAllByRole("button")).toHaveLength(COLOR_PRESETS.length);
  });

  // ラベル（色名）と塗り（色値）が同じプリセットの1件から出ていることを固定する
  it("候補は色名に対応する色値で塗られる", () => {
    renderPopover();

    for (const { value, name } of COLOR_PRESETS) {
      const swatch = screen.getByRole("button", { name: `色 ${name}` });
      expect(swatch.style.backgroundColor).toBe(rgbOf(value));
    }
  });

  it("現在値を輪郭で示す", () => {
    renderPopover(BLUE);

    // 輪郭は面色と違い role や aria では読めないのでクラスで見る
    // （`select-popover.test.tsx` のハイライト判定と同じ流儀）
    expect(hasClass(screen.getByRole("button", { name: "色 青" }), "outline-ink")).toBe(true);
    expect(hasClass(screen.getByRole("button", { name: "色 赤" }), "outline-ink")).toBe(false);
  });

  it("現在値を読み上げにも出す（`aria-pressed`）", () => {
    renderPopover(BLUE);

    expect(screen.getByRole("button", { name: "色 青" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "色 赤" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("候補にマウスを乗せるとその色の名前を吹き出しで出す", () => {
    renderPopover();
    const swatch = screen.getByRole("button", { name: "色 ライム" });

    fireEvent.mouseEnter(swatch);
    expect(screen.getByRole("tooltip").textContent).toBe("ライム");

    fireEvent.mouseLeave(swatch);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("キーボードで候補へ移っても色名を吹き出しで出す（マウスを使わなくても色名が読める）", () => {
    renderPopover();
    const swatch = screen.getByRole("button", { name: "色 ティール" });

    fireEvent.focus(swatch);
    expect(screen.getByRole("tooltip").textContent).toBe("ティール");

    fireEvent.blur(swatch);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("候補を選ぶと色値を渡して閉じる", () => {
    const { onSelect, onClose } = renderPopover();

    clickWithoutServer(screen.getByRole("button", { name: "色 グレー" }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(COLOR_BY_NAME["グレー"]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Esc で閉じる（選ばない。00_共通 §2.1「閉じ方」）", () => {
    const { onSelect, onClose } = renderPopover();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("外側のクリックで閉じる（選ばない。00_共通 §2.1「閉じ方」）", () => {
    const { onSelect, onClose } = renderPopover();

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("ColorBarButton（画面定義書03 §3.2 / 05 §4 O-1・O-2: 色見本を押して選ぶ）", () => {
  function renderButton(props: Partial<Parameters<typeof ColorBarButton>[0]> = {}) {
    const onOpen = vi.fn();
    render(
      <ColorBarButton
        color={props.color ?? RED}
        action={props.action ?? "変更"}
        size={props.size ?? "bar"}
        showName={props.showName}
        isPending={props.isPending ?? false}
        isOpen={props.isOpen ?? false}
        onOpen={onOpen}
        onSelect={props.onSelect ?? vi.fn()}
        onClose={props.onClose ?? vi.fn()}
      />
    );
    return { onOpen };
  }

  it("現在の色名を読み上げに出す（既存の色替えは「変更」）", () => {
    renderButton({ color: BLUE });

    expect(screen.getByRole("button", { name: "色を変更（現在: 青）" })).not.toBeNull();
  });

  it("新規追加行では「選択」と言う（まだ何も保存していないため）", () => {
    renderButton({ action: "選択" });

    expect(screen.getByRole("button", { name: "色を選択（現在: 赤）" })).not.toBeNull();
  });

  it("色名の併記は showName のときだけ（バンドル管理は隣にバンドル名が出るので併記しない）", () => {
    renderButton({ showName: true });

    // aria-label にも色名が入るので、ボタンの外に出ているテキストで見る
    expect(screen.getByText("赤")).not.toBeNull();
  });

  it("既定では色名を併記しない", () => {
    renderButton();

    expect(screen.queryByText("赤")).toBeNull();
  });

  it("押すと開く合図を返す（開閉の状態は呼び出し側が持つ）", () => {
    const { onOpen } = renderButton();

    clickWithoutServer(screen.getByRole("button", { name: "色を変更（現在: 赤）" }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("保存中は押せない（00_共通 §2.3「保存中に始める操作」）", () => {
    renderButton({ isPending: true });

    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "色を変更（現在: 赤）" }).disabled
    ).toBe(true);
  });

  it("isOpen のときだけプリセット選択を開く", () => {
    renderButton({ isOpen: true });

    expect(screen.queryByRole("button", { name: "色 赤" })).not.toBeNull();
  });

  it("閉じているときはプリセット選択を出さない", () => {
    renderButton();

    expect(screen.queryByRole("button", { name: "色 赤" })).toBeNull();
  });
});
