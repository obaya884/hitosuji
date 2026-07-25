import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// アプリのルータ文脈の外では本物が動かないため差し替える（アーキテクチャ定義書 §8）
const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn<() => string>() }));
vi.mock("next/navigation", () => ({ usePathname }));

import { MasterTabs } from "./master-tabs";

// 3マスタをタブ切替で1画面に集約する（画面定義書03 §2）
describe("MasterTabs（画面定義書03 §2: セクション・モード・プロジェクトのタブ）", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/masters/sections");
  });

  it("3タブをレイアウトの順（セクション → モード → プロジェクト）で出す", () => {
    render(<MasterTabs />);

    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "セクション",
      "モード",
      "プロジェクト",
    ]);
  });

  it("各タブは対応するマスタのパスへ張る", () => {
    render(<MasterTabs />);

    expect(screen.getByRole("link", { name: "モード" })).toHaveProperty(
      "pathname",
      "/masters/modes"
    );
    expect(screen.getByRole("link", { name: "プロジェクト" })).toHaveProperty(
      "pathname",
      "/masters/projects"
    );
  });

  it("現在のパスのタブだけを現在地として示す（00_共通 §1「現在地」）", () => {
    usePathname.mockReturnValue("/masters/modes");

    render(<MasterTabs />);

    expect(screen.getByRole("link", { name: "モード" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "セクション" }).getAttribute("aria-current")).toBeNull();
    expect(
      screen.getByRole("link", { name: "プロジェクト" }).getAttribute("aria-current")
    ).toBeNull();
  });

  it("完全一致で判定する（別画面にいるときはどのタブも現在地にしない）", () => {
    usePathname.mockReturnValue("/masters");

    render(<MasterTabs />);

    expect(screen.queryByRole("link", { current: "page" })).toBeNull();
  });
});
