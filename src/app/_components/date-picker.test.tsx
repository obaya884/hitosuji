import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "./date-picker";

// 表示日・今日はいずれも props で受け取る（「今日」の日界解決 F-116 は呼び出し側の責務）ため、
// このコンポーネントは現在時刻に依存しない。テストは固定の論理日付だけで組める。
// 2026-07 の月グリッド（月曜始まり）は 6/29 で始まり 8/2 で終わる5週。
// 日付の重複（29・30 は 6月と7月、1・2 は 7月と8月）を避け、テキストで引くのは 3〜28 に限る。
const DATE = "2026-07-20";
const TODAY = "2026-07-15";

function renderPicker(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <DatePicker date={DATE} today={TODAY} onSelect={onSelect} onClose={onClose} {...props} />
  );
  return { onSelect, onClose, ...view };
}

/** 日セル（月送りボタンは aria-label を持つので除く）を描画順に返す */
function dayCells(): HTMLElement[] {
  return screen.getAllByRole("button").filter((b) => !b.hasAttribute("aria-label"));
}

/** 表示テキストが一意に決まる日セル（3〜28 のみ使う） */
function dayCell(day: number): HTMLElement {
  const matched = dayCells().filter((b) => b.textContent === String(day));
  expect(matched).toHaveLength(1);
  return matched[0];
}

// クラスは部分文字列ではなくトークンで見る（`bg-accent` は `hover:bg-accent-weak` の部分文字列でもある）
const hasClass = (el: Element, token: string) => el.classList.contains(token);

/** カーソル（未確定の選択日）のリングが付いた日セルのテキスト。常に1つのはず */
function ringedDays(): (string | null)[] {
  return dayCells()
    .filter((b) => hasClass(b, "ring-1"))
    .map((b) => b.textContent);
}

describe("DatePicker（画面定義書01 §3.1 / F-117: カレンダーから離れた日付へジャンプする）", () => {
  describe("カレンダーの描画（月グリッド・週の起点は月曜）", () => {
    it("表示月は表示日の属する月（年月を見出しに出す）", () => {
      renderPicker();

      expect(screen.queryByText("2026年 7月")).not.toBeNull();
    });

    it("曜日ヘッダは月曜始まりで並べる", () => {
      const { container } = renderPicker();

      const labels = [...container.querySelectorAll("div.grid > span")].map((s) => s.textContent);
      expect(labels).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
    });

    it("月内の全日を含む完全な週を並べ、先頭のセルは月曜（前月末で端を埋める）", () => {
      renderPicker();

      const cells = dayCells();
      expect(cells).toHaveLength(35); // 2026-07 は5週
      expect(cells[0].textContent).toBe("29"); // 6/29（月）
      expect(cells.at(-1)?.textContent).toBe("2"); // 8/2（日）
    });

    it("表示日を選択済みとして示す（aria-current=date は1つだけ）", () => {
      const { container } = renderPicker();

      const current = [...container.querySelectorAll('[aria-current="date"]')];
      expect(current.map((el) => el.textContent)).toEqual(["20"]);
      expect(hasClass(current[0], "bg-accent")).toBe(true);
    });

    it("今日は選択済みとは別の見た目で示す（強調色の文字）", () => {
      renderPicker();

      const today = dayCell(15);
      expect(hasClass(today, "text-accent")).toBe(true);
      expect(hasClass(today, "bg-accent")).toBe(false); // 選択済みの塗りとは区別する
      expect(today.getAttribute("aria-current")).toBeNull();
      // 今日でも選択でもない日は強調しない
      expect(hasClass(dayCell(16), "text-accent")).toBe(false);
    });

    it("開いたときのカーソルは表示日に置く（リングは1つだけ）", () => {
      renderPicker();

      expect(ringedDays()).toEqual(["20"]);
    });

    it("表示月の外の日は薄色で区別する（前月末・翌月頭の埋め）", () => {
      renderPicker();

      expect(hasClass(dayCells()[0], "text-ink-faint")).toBe(true); // 6/29
      expect(hasClass(dayCell(21), "text-ink-faint")).toBe(false); // 7/21 は月内
    });
  });

  describe("確定（クリック / Enter）", () => {
    it("日をクリックするとその日を返す（閉じるのは呼び出し側）", () => {
      const { onSelect, onClose } = renderPicker();

      fireEvent.click(dayCell(25));

      expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-07-25");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("表示月の外の日もクリックで選べる（前月末の埋めセル）", () => {
      const { onSelect } = renderPicker();

      fireEvent.click(dayCells()[0]);

      expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-06-29");
    });

    it("Enter はカーソルの日を確定する（開いたときのカーソルは表示日）", () => {
      const { onSelect } = renderPicker();

      fireEvent.keyDown(document, { key: "Enter" });

      expect(onSelect).toHaveBeenCalledExactlyOnceWith(DATE);
    });
  });

  describe("キーボードでの日移動（H=前日・L=翌日・J=翌週・K=前週と矢印）", () => {
    const moves = [
      { key: "h", expected: "2026-07-19" },
      { key: "ArrowLeft", expected: "2026-07-19" },
      { key: "l", expected: "2026-07-21" },
      { key: "ArrowRight", expected: "2026-07-21" },
      { key: "j", expected: "2026-07-27" },
      { key: "ArrowDown", expected: "2026-07-27" },
      { key: "k", expected: "2026-07-13" },
      { key: "ArrowUp", expected: "2026-07-13" },
    ] as const;

    for (const { key, expected } of moves) {
      it(`${key} でカーソルが ${expected} へ動く`, () => {
        const { onSelect } = renderPicker();

        fireEvent.keyDown(document, { key });
        fireEvent.keyDown(document, { key: "Enter" });

        expect(onSelect).toHaveBeenCalledExactlyOnceWith(expected);
      });
    }

    it("移動するとカーソルのリングが隣のセルへ移る（リングは常に1つ）", () => {
      renderPicker();
      expect(ringedDays()).toEqual(["20"]);

      fireEvent.keyDown(document, { key: "h" });
      expect(ringedDays()).toEqual(["19"]);

      fireEvent.keyDown(document, { key: "j" });
      expect(ringedDays()).toEqual(["26"]);
    });

    it("選択済み（表示日）のセルからカーソルが離れても選択の印はそのまま", () => {
      const { container } = renderPicker();

      fireEvent.keyDown(document, { key: "l" });

      expect(ringedDays()).toEqual(["21"]);
      expect(
        [...container.querySelectorAll('[aria-current="date"]')].map((el) => el.textContent)
      ).toEqual(["20"]);
    });

    it("移動は重ねられる（カーソルが単一の真実）", () => {
      const { onSelect } = renderPicker();

      fireEvent.keyDown(document, { key: "j" });
      fireEvent.keyDown(document, { key: "l" });
      fireEvent.keyDown(document, { key: "Enter" });

      expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-07-28");
    });

    it("移動先が表示月の外なら月表示も追従する", () => {
      const { onSelect } = renderPicker({ date: "2026-07-01" });

      fireEvent.keyDown(document, { key: "h" });

      expect(screen.queryByText("2026年 6月")).not.toBeNull();
      expect(screen.queryByText("2026年 7月")).toBeNull();

      fireEvent.keyDown(document, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-06-30");
    });

    it("日移動と確定はブラウザ既定動作を抑止する（矢印のページスクロール等）", () => {
      renderPicker();

      // fireEvent は preventDefault されると false を返す
      expect(fireEvent.keyDown(document, { key: "ArrowDown" })).toBe(false);
      expect(fireEvent.keyDown(document, { key: "Enter" })).toBe(false);
    });
  });

  describe("月送り（◀ / ▶）", () => {
    it("翌月へは同じ日を保って動き、その日が無ければ月末へ丸める", () => {
      const { onSelect } = renderPicker({ date: "2026-01-31" });

      fireEvent.click(screen.getByLabelText("翌月"));

      expect(screen.queryByText("2026年 2月")).not.toBeNull();
      fireEvent.keyDown(document, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-02-28");
    });

    it("前月へは同じ日を保って動く（年をまたぐ）", () => {
      const { onSelect } = renderPicker({ date: "2026-01-31" });

      fireEvent.click(screen.getByLabelText("前月"));

      expect(screen.queryByText("2025年 12月")).not.toBeNull();
      fireEvent.keyDown(document, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledExactlyOnceWith("2025-12-31");
    });

    it("月送りだけでは確定しない（カーソル移動のみ）", () => {
      const { onSelect, onClose } = renderPicker();

      fireEvent.click(screen.getByLabelText("翌月"));

      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("閉じ方（画面定義書00_共通 §2.1: Esc と外側クリック）", () => {
    it("Esc で閉じる（選択はしない）", () => {
      const { onSelect, onClose } = renderPicker();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalledOnce();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("外側クリックで閉じる（選択はしない）", () => {
      const { onSelect, onClose } = renderPicker();

      fireEvent.mouseDown(document.body);

      expect(onClose).toHaveBeenCalledOnce();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("パネル内のクリックでは閉じない", () => {
      const { onClose } = renderPicker();

      fireEvent.mouseDown(dayCell(25));

      expect(onClose).not.toHaveBeenCalled();
    });

    it("閉じたあと（アンマウント後）はキーを拾わない", () => {
      const { onSelect, onClose, unmount } = renderPicker();

      unmount();
      fireEvent.keyDown(document, { key: "Enter" });
      fireEvent.keyDown(document, { key: "Escape" });

      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("キーボードの共通規約（画面定義書00_共通 §3）", () => {
    it("IME 変換中の Enter は確定として扱わない", () => {
      const { onSelect } = renderPicker();

      fireEvent.keyDown(document, { key: "Enter", isComposing: true });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("IME 変換中の Escape は閉じない", () => {
      const { onClose } = renderPicker();

      fireEvent.keyDown(document, { key: "Escape", isComposing: true });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("修飾キー（Cmd/Ctrl/Alt）付きのキーは操作として扱わない", () => {
      const { onSelect, onClose } = renderPicker();

      fireEvent.keyDown(document, { key: "Enter", metaKey: true });
      fireEvent.keyDown(document, { key: "l", ctrlKey: true });
      fireEvent.keyDown(document, { key: "Escape", altKey: true });

      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("割り当てのないキーは無視する", () => {
      const { onSelect, onClose } = renderPicker();

      fireEvent.keyDown(document, { key: "a" });
      fireEvent.keyDown(document, { key: "Tab" });

      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
