import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEW_TAB_ARGS, spyOnWindowOpen } from "@/app/_testing/window-open";
import { OpenUrlButton } from "./open-url-button";

describe("OpenUrlButton（F-125 / 画面定義書01 §3.3: URL の印。クリックで新しいタブに開くだけ）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("読み上げは「URL を開く」で、クリックで新しいタブに開く", () => {
    const open = spyOnWindowOpen();
    render(<OpenUrlButton url="https://example.com/doc" colorClass="" />);

    fireEvent.click(screen.getByRole("button", { name: "URL を開く" }));

    expect(open).toHaveBeenCalledWith("https://example.com/doc", ...NEW_TAB_ARGS);
  });

  it("URL の文字列は見せず、ツールチップ（title）でだけ行き先を確かめられる（画面定義書01 §3.3 / N-05）", () => {
    render(<OpenUrlButton url="https://example.com/doc" colorClass="" />);

    const button = screen.getByRole("button", { name: "URL を開く" });
    expect(button.getAttribute("title")).toBe("https://example.com/doc");
    expect(button.textContent).toBe("");
  });

  it("クリックは親へ伝播させない（行のクリックが選択を上書きしない。打刻ボタン・⭐と同じ手当て）", () => {
    spyOnWindowOpen();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <OpenUrlButton url="https://example.com/doc" colorClass="" />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "URL を開く" }));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("クリック時の追加処理（行の選択など）を呼び出し側が差し込める", () => {
    spyOnWindowOpen();
    const onClick = vi.fn();
    render(<OpenUrlButton url="https://example.com/doc" onClick={onClick} colorClass="" />);

    fireEvent.click(screen.getByRole("button", { name: "URL を開く" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
