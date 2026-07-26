import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UnsetMark } from "./unset-mark";

// クラスは部分文字列や完全一致ではなくトークンで見る（他のクラスが増えても壊れない）
const hasClass = (el: Element, token: string) => el.classList.contains(token);

// 未設定の表記を全画面で揃える規約（FB-55 で統一）。時間の値の `--:--` とは使い分ける
describe("UnsetMark（画面定義書00_共通 §2.4: 属性の未設定は薄色の `-` で示し、空欄にはしない）", () => {
  it("`-` を1文字だけ描画する（空欄にしない）", () => {
    const { container } = render(<UnsetMark />);

    expect(container.textContent).toBe("-");
  });

  it("薄色（text-ink-faint）の span で描く", () => {
    const { container } = render(<UnsetMark />);

    const mark = container.firstElementChild;
    expect(mark?.tagName).toBe("SPAN");
    expect(hasClass(mark!, "text-ink-faint")).toBe(true);
  });
});
