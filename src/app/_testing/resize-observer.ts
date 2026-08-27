import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * jsdom に無い `ResizeObserver` を局所的に補う（幾何の判定そのものは段3＝ブラウザテスト送り。
 * テスト戦略定義書 §3）。**登録は `installResizeObserver()` を `beforeEach` から呼ぶ**
 * （後始末は呼び出し側の `vi.unstubAllGlobals()`）。
 */
export class ResizeObserverStub {
  /** 生成された全インスタンス（`reset()` で空に戻す） */
  private static instances: ResizeObserverStub[] = [];

  private readonly callback: ResizeObserverCallback;
  private target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.push(this);
  }

  observe(target: Element): void {
    this.target = target;
  }
  unobserve(): void {
    this.target = null;
  }
  /**
   * 購読を解く。**no-op にしない**——観測対象を手放すことで `observing` から引けなくなり、
   * 「後片付けを書き忘れた（`useEffect` の戻り値を落とした）」変異がテストで赤くなる
   */
  disconnect(): void {
    this.target = null;
  }

  static reset(): void {
    ResizeObserverStub.instances = [];
  }

  /**
   * `target` を観測しているインスタンス。**観測対象で引く**——固定領域は板・列見出し・
   * セクション見出しの3つを別々に測る（画面定義書01 §2）ので、生成順で掴むと
   * どれを動かしているのか読めなくなる。見つからなければ計測が配線されていない
   */
  static observing(target: Element): ResizeObserverStub {
    const found = ResizeObserverStub.instances.find((o) => o.target === target);
    if (found === undefined) throw new Error("この要素を観測している ResizeObserver がありません");
    return found;
  }

  /**
   * 観測対象に高さを与えてコールバックを1回発火する。**jsdom はレイアウトを計算せず
   * `offsetHeight` が常に 0** なので値は差し込む——ここで見るのは実測の正しさ（段3送り）ではなく、
   * 測った値が行まで配線されているか。**実装は要素から測る**ので entry は空で渡す
   * （`entry.contentRect` から読む形へ変えるなら、ここも渡すように直す必要がある）
   */
  resizeTo(height: number): void {
    if (this.target === null) throw new Error("observe されていません");
    Object.defineProperty(this.target, "offsetHeight", { value: height, configurable: true });
    this.callback([], this);
  }
}

/** `beforeEach` から呼ぶ（後始末は呼び出し側の `vi.unstubAllGlobals()` が引き受ける） */
export function installResizeObserver(): void {
  ResizeObserverStub.reset();
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
}

/** 観測されている要素に高さを与える（描画の更新まで含めて1手で書けるように `act` で包む） */
export function resizeTo(target: Element, height: number): void {
  act(() => ResizeObserverStub.observing(target).resizeTo(height));
}
