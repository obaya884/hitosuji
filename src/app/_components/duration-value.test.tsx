import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { faintTextOf } from "../_testing/dom";
import { DurationValue } from "./duration-value";

describe("DurationValue（画面定義書00_共通 §2.4: 0分は未設定として薄色の `--:--`）", () => {
  it("0分は薄色の `--:--`（値ではなく不在として示す）", () => {
    const { container } = render(<DurationValue minutes={0} />);

    expect(container.textContent).toBe("--:--");
    expect(faintTextOf(container)).toBe("--:--");
  });

  // 境界の1分で見る（`1:30` のような桁上がりは `formatDuration` のユニットが持つ）
  it("1分以上は `H:MM` を通常色で出す（薄色にしない）", () => {
    const { container } = render(<DurationValue minutes={1} />);

    expect(container.textContent).toBe("0:01");
    expect(faintTextOf(container)).toBeUndefined();
  });
});
