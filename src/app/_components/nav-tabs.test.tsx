import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NavTabs } from "./nav-tabs";

// `usePathname` はアプリのルータ文脈の外では動かないため差し替える
// （アーキテクチャ定義書 §8「偽物を置いてよい境界」= フレームワークのランタイム API）
const pathname = vi.hoisted(() => ({ value: "/masters/sections" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

const TABS = [
  { href: "/masters/sections", label: "セクション" },
  { href: "/masters/modes", label: "モード" },
  { href: "/masters/projects", label: "プロジェクト" },
] as const;

const exactMatch = (path: string, href: string) => path === href;

describe("NavTabs（画面定義書03 §2: マスタ管理はタブ切替で1画面に集約し、現在地をタブに示す）", () => {
  it("渡されたタブをリンクとして順に描画する", () => {
    pathname.value = "/masters/sections";
    render(<NavTabs tabs={TABS} isCurrent={exactMatch} />);

    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "セクション",
      "モード",
      "プロジェクト",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/masters/sections",
      "/masters/modes",
      "/masters/projects",
    ]);
  });

  it("現在地のタブだけ aria-current=page を付ける", () => {
    pathname.value = "/masters/modes";
    render(<NavTabs tabs={TABS} isCurrent={exactMatch} />);

    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") !== null);
    expect(current.map((a) => a.textContent)).toEqual(["モード"]);
    expect(current[0].getAttribute("aria-current")).toBe("page");
  });

  it("アクティブ判定は呼び出し側の関数に委ねる（prefix 一致も渡せる）", () => {
    pathname.value = "/masters/modes/12";
    const prefixMatch = vi.fn((path: string, href: string) => path.startsWith(href));
    render(<NavTabs tabs={TABS} isCurrent={prefixMatch} />);

    // 現在のパスと各タブの href の組で呼ばれる
    expect(prefixMatch.mock.calls).toContainEqual(["/masters/modes/12", "/masters/modes"]);
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") !== null);
    expect(current.map((a) => a.textContent)).toEqual(["モード"]);
  });

  it("どのタブも現在地でなければ aria-current は付かない", () => {
    pathname.value = "/routines";
    render(<NavTabs tabs={TABS} isCurrent={exactMatch} />);

    expect(
      screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") !== null)
    ).toHaveLength(0);
  });

  it("タブが空なら何も描画しない", () => {
    const { container } = render(<NavTabs tabs={[]} isCurrent={exactMatch} />);

    expect(container.childElementCount).toBe(0);
  });
});
