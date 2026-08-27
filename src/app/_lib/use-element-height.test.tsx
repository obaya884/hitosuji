import { render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installResizeObserver, ResizeObserverStub, resizeTo } from "@/app/_testing/resize-observer";
import { useElementHeight } from "./use-element-height";

/**
 * 実測そのもの（どの要素が何 px か）はブラウザ段の宿題で、jsdom は `offsetHeight` が常に 0。
 * ここで固定するのは**測る仕組みの側**——観測する相手・更新の伝播・後片付け。
 *
 * 使い手（デイリーの3段の固定領域。画面定義書01 §2）が「板・列見出し・セクション見出し」を
 * 別々のインスタンスで測るようになったので、**複数が互いに干渉しないこと**もここで見る
 */
describe("useElementHeight（画面定義書01 §2: 固定領域の高さを実測する）", () => {
  beforeEach(() => {
    installResizeObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** ref を実要素に付けた状態を作る（フック単体では ref が null のままなので描画して繋ぐ） */
  function renderWithElement() {
    const captured: { height: number; ref: React.RefObject<HTMLDivElement | null> }[] = [];

    function Probe() {
      const [ref, height] = useElementHeight<HTMLDivElement>();
      captured.push({ ref, height });
      return <div ref={ref} />;
    }

    const view = render(<Probe />);
    return {
      ...view,
      element: view.container.querySelector("div")!,
      latest: () => captured[captured.length - 1]!,
    };
  }

  it("測る前の高さは 0（実測が届く前の1描画ぶん）", () => {
    const { result } = renderHook(() => useElementHeight<HTMLDivElement>());

    expect(result.current[1]).toBe(0);
  });

  it("返す ref は要素に付けるためのもので、初期値は null", () => {
    const { result } = renderHook(() => useElementHeight<HTMLDivElement>());

    expect(result.current[0].current).toBeNull();
  });

  it("ref を付けた要素を観測する", () => {
    const { element } = renderWithElement();

    expect(ResizeObserverStub.observing(element)).not.toBeNull();
  });

  it("観測した高さを返し、変わるたびに追う（初回だけ測る実装では通らない）", () => {
    const { element, latest } = renderWithElement();

    resizeTo(element, 96);
    expect(latest().height).toBe(96);

    resizeTo(element, 120);
    expect(latest().height).toBe(120);
  });

  it("複数のインスタンスはそれぞれ自分の要素を測る（3段の固定領域が互いに干渉しない）", () => {
    function Pair() {
      const [topRef, topHeight] = useElementHeight<HTMLDivElement>();
      const [bottomRef, bottomHeight] = useElementHeight<HTMLDivElement>();
      return (
        <>
          <div ref={topRef} data-testid="top" />
          <div ref={bottomRef} data-testid="bottom" />
          <output>{`${topHeight}/${bottomHeight}`}</output>
        </>
      );
    }

    const { getByTestId, getByRole } = render(<Pair />);

    resizeTo(getByTestId("top"), 96);

    // 片方だけ動かしたのだから、もう片方は 0 のまま（同じ観測者を掴んでいたら両方動く）
    expect(getByRole("status").textContent).toBe("96/0");
  });

  it("unmount で購読を解く（解かないと外れた要素を観測し続ける）", () => {
    const { element, unmount } = renderWithElement();

    unmount();

    expect(() => ResizeObserverStub.observing(element)).toThrow();
  });
});
