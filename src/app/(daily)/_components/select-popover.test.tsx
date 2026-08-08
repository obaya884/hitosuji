import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { rgbOf } from "@/app/_testing/dom";
import { SelectPopover, type PopoverOption } from "./select-popover";

// この部品は色を `backgroundColor` へ素通しするだけでモードを知らない。**本番のどこにも
// 無い色**を使うことで「渡された値をそのまま流している」ことを厳密に示す
const WORK_COLOR = "#123456";

const MODE_OPTIONS: readonly PopoverOption[] = [
  { id: null, label: "未設定" },
  { id: 1, label: "仕事", color: WORK_COLOR },
  { id: 2, label: "生活" },
  { id: 3, label: "学習" },
];

type Overrides = Readonly<{
  options?: readonly PopoverOption[];
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  onClose?: () => void;
}>;

function renderPopover(overrides: Overrides = {}) {
  const onSelect = overrides.onSelect ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const result = render(
    <SelectPopover
      options={overrides.options ?? MODE_OPTIONS}
      selectedId={overrides.selectedId ?? null}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
  return { ...result, onSelect, onClose };
}

/** 候補ボタンを表示順に返す（区切り線も子要素として並ぶため index は data 属性で引く） */
function optionButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("[data-option-index]")];
}

/**
 * 候補の名前を載せた span。カラーバー・付記（hint）・チェックと同階層に並ぶため、
 * 「最初の span」ではなく折り返し省略の指定（truncate）を持つものを名指しする
 */
function labelSpanOf(button: HTMLButtonElement): HTMLElement {
  const span = button.querySelector<HTMLElement>("span.truncate");
  if (span === null) throw new Error(`候補「${button.textContent}」の名前が見つかりません`);
  return span;
}

/**
 * ハイライト中の候補のラベル。面色（`bg-accent-weak`）で示されるので classList で読む
 * （`hover:bg-accent-weak` は別トークンなので classList.contains では一致しない）
 */
function activeLabel(container: HTMLElement): string | undefined {
  return optionButtons(container).find((b) => b.classList.contains("bg-accent-weak"))?.textContent
    ?? undefined;
}

// 幾何（上向き反転）は jsdom では常に「反転しない」偽の緑になるためブラウザ段送り。
// ここは開閉・候補選択・キー操作（00_共通 §2.1 / F-112）に絞る
describe("SelectPopover（画面定義書01 O-5 / F-112: 候補をクリックまたは J/K + Enter で選ぶ）", () => {
  it("渡された候補をすべて表示し、先頭に「未設定」の候補が並ぶ（00_共通 §2.4）", () => {
    const { container } = renderPopover();

    expect(optionButtons(container).map((b) => b.textContent)).toEqual([
      "未設定",
      "仕事",
      "生活",
      "学習",
    ]);
  });

  it("「未設定」の候補は薄色にする（実マスタと見分ける）", () => {
    const { container } = renderPopover();

    // 名前の span を名指しする（色付き候補の先頭の子はカラーバーの span で、そこに薄色は元から付かない）
    const [none, real] = optionButtons(container).map(labelSpanOf);
    expect(none.classList.contains("text-ink-faint")).toBe(true);
    expect(real.classList.contains("text-ink-faint")).toBe(false);
  });

  it("開くと現在値をハイライトし、チェックを付ける（F-112）", () => {
    const { container } = renderPopover({ selectedId: 2 });

    expect(activeLabel(container)).toBe("生活");
    // チェックは現在値の候補だけに付く
    const checked = optionButtons(container).filter((b) => b.querySelector("svg") !== null);
    expect(checked.map((b) => b.textContent)).toEqual(["生活"]);
  });

  it("現在値が候補に無ければ先頭をハイライトする", () => {
    const { container } = renderPopover({ selectedId: 999 });

    expect(activeLabel(container)).toBe("未設定");
  });

  it("J で次の候補・K で前の候補へ移り、Enter でその候補を確定して閉じる（F-112）", () => {
    const { container, onSelect, onClose } = renderPopover({ selectedId: null });

    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "j" });
    expect(activeLabel(container)).toBe("生活");

    fireEvent.keyDown(document, { key: "k" });
    expect(activeLabel(container)).toBe("仕事");

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("J/K は端で止まる（一覧を巡回させない）", () => {
    const { container } = renderPopover({ selectedId: null });

    fireEvent.keyDown(document, { key: "k" });
    expect(activeLabel(container)).toBe("未設定");

    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(document, { key: "j" });
    expect(activeLabel(container)).toBe("学習");
  });

  // 背後（window）の打刻ショートカットへ確定の Enter が抜けると、選択と同時に打刻が走る。
  // グローバル側の editing ガードは確定に伴う再レンダーの隙間をすり抜けるため、ここで伝播を断つ契約
  it("確定・候補移動のキーを背後へ伝播させない（FB-42）", () => {
    const behind = vi.fn();
    window.addEventListener("keydown", behind);
    try {
      renderPopover();

      fireEvent.keyDown(document, { key: "j" });
      fireEvent.keyDown(document, { key: "k" });
      fireEvent.keyDown(document, { key: "Enter" });

      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", behind);
    }
  });

  it("Esc は取消（選択せず閉じる）", () => {
    const { onSelect, onClose } = renderPopover();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("クリックでも選べる（マウスとキーボードは等価。§5）", () => {
    const { onSelect, onClose } = renderPopover();

    fireEvent.click(screen.getByText("学習"));

    expect(onSelect).toHaveBeenCalledWith(3);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("「未設定」を選ぶと null を渡す（割り当ての解除）", () => {
    const { onSelect } = renderPopover({ selectedId: 1 });

    fireEvent.click(screen.getByText("未設定"));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("外側のクリックで閉じる（00_共通 §2.1）", () => {
    const { onClose } = renderPopover();

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("IME変換中のキーは操作として扱わない（00_共通 §3）", () => {
    const { container, onSelect, onClose } = renderPopover();

    fireEvent.keyDown(document, { key: "j", isComposing: true });
    fireEvent.keyDown(document, { key: "Enter", isComposing: true });
    fireEvent.keyDown(document, { key: "Escape", isComposing: true });

    expect(activeLabel(container)).toBe("未設定");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("修飾キー併用はブラウザ既定へ委ねる（00_共通 §3: 修飾キーは Shift のみ）", () => {
    const { container, onSelect } = renderPopover();

    fireEvent.keyDown(document, { key: "j", metaKey: true });
    fireEvent.keyDown(document, { key: "j", ctrlKey: true });
    fireEvent.keyDown(document, { key: "j", altKey: true });
    expect(activeLabel(container)).toBe("未設定");

    fireEvent.keyDown(document, { key: "Enter", metaKey: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  // 画面全体のショートカット（00_共通 §3 の「テキスト入力中は無効」）と違い、
  // オーバーレイのキーナビは入力欄ガードを持たない＝現状の挙動を固定する。
  // §3 はこの例外を明記していないため、統一の可否はオーナー裁定待ち（T-45）
  it("入力欄にフォーカスがあっても候補の移動・確定は効く（オーバーレイは入力欄ガードを持たない）", () => {
    const { container, onSelect } = renderPopover();
    const input = container.appendChild(document.createElement("input"));

    fireEvent.keyDown(input, { key: "j" });
    // 移動先を名指しする（`not.toBe` だと `activeLabel` が undefined を返す
    // 「ハイライトが消えた」ケースと区別できず、偽の緑になる）
    expect(activeLabel(container)).toBe("仕事");

    fireEvent.keyDown(input, { key: "Enter" });
    // 確定先まで見る（呼ばれたことだけでは、移動先と別の候補を確定しても緑になる）
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("モードの色はカラーバーで示す（候補の見分け）", () => {
    const { container } = renderPopover();

    const [, work] = optionButtons(container);
    const bar = work.firstElementChild as HTMLElement;
    expect(bar.style.backgroundColor).toBe(rgbOf(WORK_COLOR));
    expect(bar.getAttribute("aria-hidden")).not.toBeNull();
  });

  it("時間帯などの付記（hint）を名前の右に添える（FB-46）", () => {
    const { container } = renderPopover({
      options: [
        { id: null, label: "未分類" },
        { id: 10, label: "朝", hint: "06:00–09:00" },
      ],
    });

    const [, morning] = optionButtons(container);
    expect(morning.textContent).toBe("朝06:00–09:00");
    // 付記は名前の右（末尾）に置く。名前側が省略され、付記は詰めない（00_共通 §2.1）
    expect((morning.lastElementChild as HTMLElement).textContent).toBe("06:00–09:00");
  });

  describe("先頭の固定項目（§4.3「現在のセクションへ」）", () => {
    const PINNED: readonly PopoverOption[] = [
      { id: 20, label: "現在のセクションへ（午前）", isPinned: true },
      { id: null, label: "未分類" },
      { id: 10, label: "朝", hint: "06:00–09:00" },
      { id: 20, label: "午前", hint: "09:00–12:00" },
    ];

    it("固定項目は初期ハイライトにしない（現在値のハイライトは従来どおり）", () => {
      const { container } = renderPopover({ options: PINNED, selectedId: 10 });

      expect(activeLabel(container)).toBe("朝06:00–09:00");
    });

    it("現在値が固定項目と同じ id でも、ハイライトは実候補側に付く（先頭に吸われない）", () => {
      const { container } = renderPopover({ options: PINNED, selectedId: 20 });

      expect(activeLabel(container)).toBe("午前09:00–12:00");
    });

    it("現在値が候補に無くても固定項目へは落とさない（最初の実候補をハイライトする）", () => {
      const { container } = renderPopover({ options: PINNED, selectedId: 999 });

      expect(activeLabel(container)).toBe("未分類");
    });

    it("固定項目にはチェックを付けない（印は実候補側だけが担う）", () => {
      const { container } = renderPopover({ options: PINNED, selectedId: 20 });

      const checked = optionButtons(container).filter((b) => b.querySelector("svg") !== null);
      expect(checked.map((b) => b.textContent)).toEqual(["午前09:00–12:00"]);
    });

    it("固定項目の直後に区切り線を引いて実候補と分ける", () => {
      const { container } = renderPopover({ options: PINNED });

      const panel = container.firstElementChild as HTMLElement;
      const dividers = [...panel.children].filter((el) => el.tagName === "DIV");
      expect(dividers).toHaveLength(1);
      // 区切り線は固定項目の直後（＝パネルの2番目の子）に入る
      expect(panel.children[1]).toBe(dividers[0]);
    });

    it("固定項目も J/K で辿れる（実候補と同列に並ぶ）", () => {
      const { container, onSelect } = renderPopover({ options: PINNED, selectedId: null });

      fireEvent.keyDown(document, { key: "k" });
      expect(activeLabel(container)).toBe("現在のセクションへ（午前）");

      fireEvent.keyDown(document, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith(20);
    });
  });
});
