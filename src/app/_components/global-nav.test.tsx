import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GlobalNav } from "./global-nav";

// `usePathname` はアプリのルータ文脈の外では動かないため差し替える
// （アーキテクチャ定義書 §8「偽物を置いてよい境界」= フレームワークのランタイム API）
const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

/** レール内のナビ項目（ロゴを除く）を描画順に返す */
function navItems() {
  return screen
    .getAllByRole("link")
    .filter((a) => a.closest("li") !== null);
}

// クラスは部分文字列ではなくトークンで見る（`bg-accent` は `hover:bg-accent-weak` の部分文字列でもある）
const hasClass = (el: Element, token: string) => el.classList.contains(token);

/** aria-current=page が付いている項目のラベル */
function currentLabels() {
  return navItems()
    .filter((a) => a.getAttribute("aria-current") === "page")
    .map((a) => a.textContent);
}

describe("GlobalNav（画面定義書00_共通 §1: Navigation Rail はラベルのみの4項目＋ロゴ＝ホーム、現在地をレールに示す）", () => {
  it("デイリー / ルーチン / マスタ / レビュー の4項目をこの順で並べる", () => {
    pathname.value = "/";
    render(<GlobalNav />);

    expect(navItems().map((a) => a.textContent)).toEqual([
      "デイリー",
      "ルーチン",
      "マスタ",
      "レビュー",
    ]);
    expect(navItems().map((a) => a.getAttribute("href"))).toEqual([
      "/",
      "/routines",
      "/masters",
      "/review",
    ]);
  });

  it("アイコンは使わずラベルのみ（N-05）", () => {
    pathname.value = "/";
    const { container } = render(<GlobalNav />);

    expect(container.querySelectorAll("svg, img")).toHaveLength(0);
  });

  it("アプリ名はレール上部に置き、今日のデイリー（日付なしのルート）へ戻る（FB-45）", () => {
    pathname.value = "/review";
    render(<GlobalNav />);

    const logo = screen.getByRole("link", { name: "Hitosuji" });
    expect(logo.getAttribute("href")).toBe("/");
    // レール内の先頭要素＝ナビ項目より前に置く
    const nav = logo.closest("nav");
    expect(nav?.firstElementChild).toBe(logo);
    // ロゴは現在地表示の対象にしない（項目側で示す）
    expect(logo.getAttribute("aria-current")).toBeNull();
  });

  it("デイリーの現在地判定は完全一致（他画面にいるときは点灯しない）", () => {
    pathname.value = "/routines";
    render(<GlobalNav />);

    expect(currentLabels()).toEqual(["ルーチン"]);
  });

  it("ルート（/）ではデイリーが現在地", () => {
    pathname.value = "/";
    render(<GlobalNav />);

    expect(currentLabels()).toEqual(["デイリー"]);
  });

  it("下位パスにいてもその画面の項目が現在地（prefix 一致）", () => {
    pathname.value = "/masters/modes";
    render(<GlobalNav />);

    expect(currentLabels()).toEqual(["マスタ"]);
  });

  // 「スクロールしても常に見える」こと自体は幾何なので jsdom では確かめられない（ブラウザ段の宿題）。
  // ここで固定できるのは、そのために必要なクラスの組が nav に揃っていることまで——
  // `self-start` は「flex 子は既定で伸びきり sticky が効かない」ための必須要素で、
  // 落とすと sticky と h-screen が残っていても固定が壊れる（実装コメント参照）
  it("レールに固定表示のためのクラス一式が付いている（sticky / h-screen / self-start）", () => {
    pathname.value = "/";
    const { container } = render(<GlobalNav />);

    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    for (const token of ["sticky", "top-0", "h-screen", "self-start"]) {
      expect(hasClass(nav!, token)).toBe(true);
    }
  });
});
