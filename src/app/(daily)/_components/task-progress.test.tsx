import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { hasClass } from "@/app/_testing/dom";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import { TaskProgress } from "./task-progress";

// 件数の意味（実施済み＝ended_at あり、実行中は含めない）は domain 側の
// daily-list.test.ts が担保済み。ここは描画（比率→幅・テキスト・プロップ差し替え）に絞る
const done = (id: number) => task({ id, startedAt: atJst("09:00"), endedAt: atJst("09:30") });
const running = (id: number) => task({ id, startedAt: atJst("10:00") });
const todo = (id: number) => task({ id });

/**
 * 観測点はクラス名ではなく構造で取る（トークンをリネームしても挙動不変なら赤くしない）。
 * バーは装飾なので aria-hidden で、件数はテキストで読める
 */
function parts(container: HTMLElement) {
  const track = container.firstElementChild as HTMLElement;
  return {
    track,
    fill: track.firstElementChild as HTMLElement,
    label: container.lastElementChild as HTMLElement,
  };
}

describe("TaskProgress（F-114: タスク消化の進捗。画面定義書01 §3.1・§3.2 で同じ見た目を使う）", () => {
  it("実施済み件数/全件数を表示する", () => {
    const { container } = render(<TaskProgress tasks={[done(1), running(2), todo(3)]} />);

    expect(parts(container).label.textContent).toBe("1/3");
  });

  it("完了件数の比率でバーの幅が決まる", () => {
    const { container } = render(<TaskProgress tasks={[done(1), done(2), todo(3)]} />);

    expect(parts(container).fill.style.width).toBe(`${(2 / 3) * 100}%`);
  });

  it("全件完了なら 100%", () => {
    const { container } = render(<TaskProgress tasks={[done(1), done(2)]} />);

    const { fill, label } = parts(container);
    expect(label.textContent).toBe("2/2");
    expect(fill.style.width).toBe("100%");
  });

  it("1件も完了していなければ 0%", () => {
    const { container } = render(<TaskProgress tasks={[running(1), todo(2)]} />);

    const { fill, label } = parts(container);
    expect(label.textContent).toBe("0/2");
    expect(fill.style.width).toBe("0%");
  });

  it("0件ならバーの幅は 0（ゼロ除算で NaN にならない）", () => {
    const { container } = render(<TaskProgress tasks={[]} />);

    const { fill, label } = parts(container);
    expect(label.textContent).toBe("0/0");
    expect(fill.style.width).toBe("0px");
  });

  it("既定のバー幅と文字サイズを持つ（§3.2 のセクション見出しはメタ段。00_共通 §1.1）", () => {
    const { container } = render(<TaskProgress tasks={[todo(1)]} />);

    const { track, label } = parts(container);
    expect(hasClass(track, "w-20")).toBe(true);
    expect(hasClass(label, "text-xs")).toBe(true);
  });

  it("バー幅と文字サイズは呼び出し側が差し替えられる（§3.1 のサマリ行の数値は主段）", () => {
    const { container } = render(
      <TaskProgress tasks={[todo(1)]} barWidth="w-40" textSize="text-base" />
    );

    const { track, label } = parts(container);
    // 差し替え先がバーと文字それぞれに効いていること（取り違えを検出する）
    expect(hasClass(track, "w-40")).toBe(true);
    expect(hasClass(track, "w-20")).toBe(false);
    expect(hasClass(label, "text-base")).toBe(true);
    expect(hasClass(label, "text-xs")).toBe(false);
  });
});
