"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * 要素の高さを実測して返す（画面定義書01 §2 の固定領域の積み上げに使う）。
 *
 * 固定した見出しの `top` と、選択行の追従が避ける高さ（§5）は**実際に描かれた高さ**でしか
 * 決まらない——上部の板は「今日へ」ボタンの有無や折り返しで高さが変わり、見出し行も
 * 文字サイズの見直しで変わる。定数で置くと、変えた側と追随しなかった側のずれが
 * 「行が見出しの裏に隠れる」形で出るので、`ResizeObserver` で追う。
 *
 * **高さは小数のまま返す**（`offsetHeight` を使わない）。表のセルの実高は
 * `border-collapse: collapse` の下では 36.5px のような小数になり、整数へ丸めると
 * その差がそのまま下の段の `top` のずれになる——**段のあいだに 1px 弱の隙間が開き、
 * 裏を流れる行が覗く**（FB-111）。
 *
 * 高さの初期値は 0。**測る前の1描画では固定領域が無いものとして扱われる**が、
 * 追従が起きるのはキー操作の後なので実害はない。
 *
 * **観測するのはマウント時の要素だけ**（購読は張り替えない）。条件付きで現れる要素や、
 * 並びによって差し替わる要素に渡すと 0 のままになる——使う側が「常にある1つ」に付けること
 */
export function useElementHeight<T extends HTMLElement>(): readonly [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const observer = new ResizeObserver(() => setHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
}
