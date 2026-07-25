"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { shouldFlipUp } from "./flip-up";

/** 下向き（既定）。静的位置＝アンカーの直下に開く */
const DOWN = "mt-1";
/** 上向き。アンカーの上端を基準に開く */
const UP = "bottom-full mb-1";

/**
 * ポップオーバーが画面下部で切れないように、開いた直後に実測して上向きへ反転する
 * （画面定義書00_共通 §2.1「表示位置」/ FB-21）。反転するかの判定は `flip-up.ts` の純関数が持つ。
 *
 * 返す ref は絶対配置のパネル自身に付ける（位置の基準はその `offsetParent` ＝ `relative` の親）。
 * 反転の判定は開いた時の1回だけで、開いている間はスクロールしても追従させない。
 *
 * @param open パネルが表示されているか。閉じている間はマウントされない使い方なら既定の true でよい
 */
export function useFlipUp<T extends HTMLElement>(open = true) {
  const ref = useRef<T>(null);
  const [up, setUp] = useState(false);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!open || panel === null) {
      setUp(false);
      return;
    }

    const anchor = (panel.offsetParent ?? panel.parentElement)?.getBoundingClientRect();
    if (anchor === undefined) return;

    // 実測値を読むのはここだけ。判定そのものは純関数（`flip-up.ts`）が持つ
    setUp(
      shouldFlipUp({
        panelHeight: panel.offsetHeight,
        anchorTop: anchor.top,
        anchorBottom: anchor.bottom,
        viewportHeight: window.innerHeight,
      })
    );
  }, [open]);

  return { ref, positionClass: up ? UP : DOWN } as const;
}
