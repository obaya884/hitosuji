import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { pathname } from "../_testing/next-navigation";
import { NavTabs } from "./nav-tabs";

const TABS = [
  { href: "/masters/sections", label: "セクション" },
  { href: "/masters/projects", label: "プロジェクト" },
  { href: "/masters/modes", label: "モード" },
] as const;

const exactMatch = (path: string, href: string) => path === href;

// NavTabs は画面内タブの汎用描画部品で、条項を持つのは使う側（現状は画面定義書03 §2 の
// マスタ管理タブが唯一の呼び出し側）。ここでは部品としての契約——タブ定義どおりのリンクを並べ、
// 現在地を aria-current=page で示し、どれが現在地かの判定は呼び出し側に委ねる——を固定する
describe("NavTabs（画面内タブの汎用描画: 現在地を aria-current=page で示し、判定は呼び出し側に委ねる）", () => {
  it("渡されたタブをリンクとして順に描画する", () => {
    pathname.value = "/masters/sections";
    render(<NavTabs tabs={TABS} isCurrent={exactMatch} />);

    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "セクション",
      "プロジェクト",
      "モード",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/masters/sections",
      "/masters/projects",
      "/masters/modes",
    ]);
  });

  it("現在地のタブだけ aria-current=page を付ける", () => {
    pathname.value = "/masters/modes";
    render(<NavTabs tabs={TABS} isCurrent={exactMatch} />);

    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.map((a) => a.textContent)).toEqual(["モード"]);
  });

  it("アクティブ判定は呼び出し側の関数に委ねる（prefix 一致を渡せば下位パスでも点灯する）", () => {
    pathname.value = "/masters/modes/12";
    const prefixMatch = (path: string, href: string) => path.startsWith(href);
    render(<NavTabs tabs={TABS} isCurrent={prefixMatch} />);

    // 完全一致なら1つも点かないパスで、prefix 一致を渡すとモードが現在地になる
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.map((a) => a.textContent)).toEqual(["モード"]);
  });

  it("どのタブも現在地でなければ aria-current は付かない", () => {
    pathname.value = "/routines";
    render(<NavTabs tabs={TABS} isCurrent={exactMatch} />);

    expect(screen.queryAllByRole("link", { current: "page" })).toHaveLength(0);
  });
});
