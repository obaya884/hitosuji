import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { hasClass } from "../_testing/dom";
import { UnsetMark, UnsetTimeMark } from "./unset-mark";

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

// どのセルで記号を出すかは各画面が決める（§2.4 の「記録・導出のセル」）
describe("UnsetTimeMark（画面定義書00_共通 §2.4: 時間の値の未設定・未確定は薄色の `--:--`）", () => {
  it("`--:--` を薄色の span で描く（確定値と同じセルに並んでも記号だけが弱まる）", () => {
    const { container } = render(<UnsetTimeMark />);

    expect(container.textContent).toBe("--:--");
    const mark = container.firstElementChild;
    expect(mark?.tagName).toBe("SPAN");
    expect(hasClass(mark!, "text-ink-faint")).toBe(true);
  });
});
