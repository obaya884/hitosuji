import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// アプリのルータ文脈の外では本物が動かないため差し替える（アーキテクチャ定義書 §8）
const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn<() => string>() }));
vi.mock("next/navigation", () => ({ usePathname }));

import { MasterTabs } from "./master-tabs";

// 3マスタをタブ切替で1画面に集約する（画面定義書03 §2）。
// この画面が持つのはタブ定義と現在地の判定式だけで、描画（aria-current の付け方）は NavTabs 側の責務
describe("MasterTabs（画面定義書03 §2: セクション・モード・プロジェクトのタブ）", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/masters/sections");
  });

  it("3タブをレイアウトの順（セクション → モード → プロジェクト）で対応するパスへ張る", () => {
    render(<MasterTabs />);

    expect(
      screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])
    ).toEqual([
      ["セクション", "/masters/sections"],
      ["モード", "/masters/modes"],
      ["プロジェクト", "/masters/projects"],
    ]);
  });

  it("現在地の判定は完全一致（下位パスにいるときはどのタブも現在地にしない）", () => {
    usePathname.mockReturnValue("/masters/modes");
    const { rerender } = render(<MasterTabs />);
    expect(screen.getByRole("link", { current: "page" }).textContent).toBe("モード");

    usePathname.mockReturnValue("/masters/modes/detail");
    rerender(<MasterTabs />);

    expect(screen.queryByRole("link", { current: "page" })).toBeNull();
  });
});
