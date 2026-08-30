import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { pathname } from "@/app/_testing/next-navigation";
import { MasterTabs } from "./master-tabs";

// 3マスタをタブ切替で1画面に集約する（画面定義書03 §2）。
// この画面が持つのはタブ定義と現在地の判定式だけで、描画（aria-current の付け方）は NavTabs 側の責務
describe("MasterTabs（画面定義書03 §2: セクション・プロジェクト・モードのタブ）", () => {
  beforeEach(() => {
    pathname.value = "/masters/sections";
  });

  it("3タブをレイアウトの順（セクション → プロジェクト → モード）で対応するパスへ張る", () => {
    render(<MasterTabs />);

    expect(
      screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])
    ).toEqual([
      ["セクション", "/masters/sections"],
      ["プロジェクト", "/masters/projects"],
      ["モード", "/masters/modes"],
    ]);
  });

  it("現在地の判定は完全一致（下位パスにいるときはどのタブも現在地にしない）", () => {
    pathname.value = "/masters/modes";
    const { rerender } = render(<MasterTabs />);
    expect(screen.getByRole("link", { current: "page" }).textContent).toBe("モード");

    pathname.value = "/masters/modes/detail";
    rerender(<MasterTabs />);

    expect(screen.queryByRole("link", { current: "page" })).toBeNull();
  });
});
