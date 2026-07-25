import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DateNav } from "./date-nav";

// `useRouter` はアプリのルータ文脈の外では動かないため差し替える
// （アーキテクチャ定義書 §8「偽物を置いてよい境界」= フレームワークのランタイム API）。
// 差し替えの目的は「呼ばれたか」の確認ではなく、遷移先 URL の契約（`?date=`）を固定すること
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const DATE = "2026-07-20"; // 月曜
const WEEKDAY = 1;

beforeEach(() => {
  vi.clearAllMocks();
});

function renderNav(props: Partial<React.ComponentProps<typeof DateNav>> = {}) {
  return render(<DateNav date={DATE} weekday={WEEKDAY} isToday basePath="/" {...props} />);
}

// クラスは部分文字列ではなくトークンで見る（`bg-accent` は `hover:bg-accent-weak` の部分文字列でもある）
const hasClass = (el: Element, token: string) => el.classList.contains(token);

describe("DateNav（画面定義書01 §3.1: 日付表示と前日/翌日/今日への移動）", () => {
  it("日付は `YYYY-MM-DD(曜)` で表示する", () => {
    renderNav();

    expect(screen.queryByText("2026-07-20(月)")).not.toBeNull();
  });

  it("◀ / ▶ は前日 / 翌日へのリンク（表示中の画面の basePath を保つ）", () => {
    renderNav({ basePath: "/review" });

    expect(screen.getByLabelText("前日").getAttribute("href")).toBe("/review?date=2026-07-19");
    expect(screen.getByLabelText("翌日").getAttribute("href")).toBe("/review?date=2026-07-21");
  });

  it("月をまたぐ前日 / 翌日も論理日付として正しい", () => {
    renderNav({ date: "2026-08-01", weekday: 6 });

    expect(screen.getByLabelText("前日").getAttribute("href")).toBe("/?date=2026-07-31");
    expect(screen.getByLabelText("翌日").getAttribute("href")).toBe("/?date=2026-08-02");
  });

  it("今日を表示中は「今日へ」を出さない（ボタンの有無が今日以外であることを示す。FB-07）", () => {
    renderNav({ isToday: true });

    expect(screen.queryByText("今日へ")).toBeNull();
  });

  it("今日以外を表示中は「今日へ」を出し、日付なしの basePath へ戻す", () => {
    renderNav({ isToday: false, basePath: "/review" });

    expect(screen.getByText("今日へ").getAttribute("href")).toBe("/review");
  });

  describe("datepicker を持たない画面（picker 未指定）", () => {
    it("日付はクリックできない素の表示にする", () => {
      renderNav();

      // ◀ / ▶ はリンクなので、ボタンは1つも無い
      expect(screen.queryAllByRole("button")).toHaveLength(0);
      expect(screen.queryByText("2026-07-20(月)")?.tagName).toBe("SPAN");
    });
  });

  describe("datepicker を持つ画面（F-117）", () => {
    const picker = (open: boolean, onOpenChange = vi.fn()) => ({
      today: "2026-07-15",
      open,
      onOpenChange,
    });

    it("日付表示がボタンになり、閉じているうちはカレンダーを出さない", () => {
      renderNav({ picker: picker(false) });

      const trigger = screen.getByRole("button", { name: "2026-07-20(月)" });
      expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText("2026年 7月")).toBeNull();
    });

    it("日付表示のクリックで開閉を呼び出し側へ持ち上げる", () => {
      const onOpenChange = vi.fn();
      renderNav({ picker: picker(false, onOpenChange) });

      fireEvent.click(screen.getByRole("button", { name: "2026-07-20(月)" }));

      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    });

    it("開いているときのクリックは閉じる側へ倒す", () => {
      const onOpenChange = vi.fn();
      renderNav({ picker: picker(true, onOpenChange) });

      fireEvent.click(screen.getByRole("button", { name: "2026-07-20(月)" }));

      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    });

    it("open のときカレンダーを表示日の月で開く（aria-expanded も true）", () => {
      renderNav({ picker: picker(true) });

      expect(screen.getByRole("button", { name: "2026-07-20(月)" }).getAttribute("aria-expanded")).toBe(
        "true"
      );
      expect(screen.queryByText("2026年 7月")).not.toBeNull();
    });

    it("日を選ぶとカレンダーを閉じ、その日付へ遷移する（?date=）", () => {
      const onOpenChange = vi.fn();
      renderNav({ picker: picker(true, onOpenChange), basePath: "/review" });

      // 7/25（2026-07 のグリッドで "25" の日セルは一意）
      fireEvent.click(screen.getByRole("button", { name: "25" }));

      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
      expect(router.push).toHaveBeenCalledExactlyOnceWith("/review?date=2026-07-25");
    });

    it("表示日と同じ日を選んだときは遷移しない（閉じるだけ）", () => {
      const onOpenChange = vi.fn();
      renderNav({ picker: picker(true, onOpenChange) });

      fireEvent.click(screen.getByRole("button", { name: "20" }));

      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
      expect(router.push).not.toHaveBeenCalled();
    });

    it("Esc で閉じるだけで遷移しない", () => {
      const onOpenChange = vi.fn();
      renderNav({ picker: picker(true, onOpenChange) });

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
      expect(router.push).not.toHaveBeenCalled();
    });

    it("今日は picker から受け取った値で強調する（日界考慮済み。F-116）", () => {
      renderNav({ picker: picker(true) });

      const today = screen.getByRole("button", { name: "15" });
      expect(hasClass(today, "text-accent")).toBe(true);
    });
  });
});
