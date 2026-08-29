// ブラウザ段（テスト戦略定義書 §3 / T-03）。jsdom 段（`use-flip-up.test.tsx`）は
// offsetHeight・getBoundingClientRect() が常に 0 を返すため**常に下向き**の状態しか作れず、
// 反転そのものを検証できない。判定式の境界は純関数のユニット段（`flip-up.test.ts`）が網羅する
// ので、この段が持つのは**実測の配線**——どの要素を測っているか、いつ測るか——の2点だけ。
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useFlipUp } from "./use-flip-up";

/** `use-flip-up.ts` が非公開で持つ位置クラスの写し（下向き＝アンカーの直下） */
const DOWN = "mt-1";
/** 同上（上向き＝アンカーの上端が基準） */
const UP = "bottom-full mb-1";

/** `vitest.browser.config.mts` の browser instance が定める viewport（下の「段の前提」が固定する） */
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const ANCHOR_HEIGHT = 24;
const PANEL_HEIGHT = 200;

type PanelProps = Readonly<{
  panelRef: React.Ref<HTMLDivElement>;
  positionClass: string;
}>;

/** 測られる側。幾何はインライン style で作る——この段が測るのはレイアウト計算そのものなので、Tailwind のクラス解決を挟まない */
function Panel({ panelRef, positionClass }: PanelProps) {
  return (
    <div
      ref={panelRef}
      data-testid="panel"
      className={positionClass}
      style={{ position: "absolute", width: 200, height: PANEL_HEIGHT }}
    />
  );
}

type FixtureProps = Readonly<{
  /** 起点（パネルの `offsetParent`）の viewport 上端からの位置 */
  anchorTop: number;
  /** ページ全体の高さ。viewport より高くするとスクロールできる */
  pageHeight?: number;
}>;

/**
 * 起点とパネルだけの最小の盤面。起点は絶対配置なのでパネルの `offsetParent` になり、
 * パネルはそこを基準に開く（本番の `select-popover.tsx` と同じ入れ子）。
 */
function Fixture({ anchorTop, pageHeight = 0 }: FixtureProps) {
  const { ref, positionClass } = useFlipUp<HTMLDivElement>();

  return (
    <>
      <div style={{ height: pageHeight }} />
      <div
        style={{ position: "absolute", top: anchorTop, left: 0, width: 200, height: ANCHOR_HEIGHT }}
      >
        <Panel panelRef={ref} positionClass={positionClass} />
      </div>
    </>
  );
}

function panelClass() {
  return screen.getByTestId("panel").className;
}

// ページのスクロール位置は文書に残るので、次のテストの幾何を狂わせないよう毎回戻す
afterEach(() => window.scrollTo(0, 0));

describe("useFlipUp（画面定義書00_共通 §2.1: ポップオーバーは画面下部で切れないよう上向きへ反転する）", () => {
  it("段の前提: viewport は設定が定める 1280x800", () => {
    // 以下3本の余白の計算はこの大きさを前提に書いてある。設定を変えたらここが最初に落ちる
    expect({ width: window.innerWidth, height: window.innerHeight }).toEqual({
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
    });
  });

  it("下に入りきらず上の余白の方が広ければ上向きに開く", () => {
    // 起点は viewport 下端付近。下の余白は 800-724=76px しかなく、上には 700px ある
    render(<Fixture anchorTop={VIEWPORT_HEIGHT - 100} />);

    expect(panelClass()).toBe(UP);
  });

  it("下に入りきるなら下向きのまま", () => {
    // 起点は viewport 上部。下に 676px あり 200px のパネルは収まる
    render(<Fixture anchorTop={100} />);

    expect(panelClass()).toBe(DOWN);
  });

  it("測るのは親要素ではなく配置の基準（offsetParent）", () => {
    // 配置の基準（relative の祖先）を viewport 下端まで伸ばし、パネルの直接の親はその先頭に置く。
    // 基準を測れば下の余白は 50px しかないので上向き、親を測れば 676px 空いていて下向きになる
    function NestedFixture() {
      const { ref, positionClass } = useFlipUp<HTMLDivElement>();
      return (
        <div style={{ position: "relative", top: 100, width: 200, height: VIEWPORT_HEIGHT - 150 }}>
          <div style={{ height: ANCHOR_HEIGHT }}>
            <Panel panelRef={ref} positionClass={positionClass} />
          </div>
        </div>
      );
    }

    render(<NestedFixture />);

    expect(panelClass()).toBe(UP);
  });

  it("向きは開いた直後の1回だけで決まり、スクロールしても動かない", async () => {
    // 開いた時点では下端付近なので上向き。スクロールで起点が viewport 上部へ移っても、
    // 開いている間は測り直さない（§2.1「位置は開いた直後に1回だけ決める」）
    render(<Fixture anchorTop={VIEWPORT_HEIGHT - 100} pageHeight={2000} />);
    expect(panelClass()).toBe(UP);

    window.scrollTo(0, VIEWPORT_HEIGHT - 200);
    // スクロールが実際に起きたことを確かめてから待つ（動いていなければ以下は何も試していない）
    expect(window.scrollY).toBe(VIEWPORT_HEIGHT - 200);
    // 追従の実装があれば scroll リスナ → setState → 再レンダーまで届く猶予を取る。
    // **`requestAnimationFrame` 1回では足りない**——await の継続はマイクロタスクで、React が
    // 再レンダーを流す MessageChannel のタスクより先に走るため、追従を足しても緑のままになる
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(panelClass()).toBe(UP);
  });
});
