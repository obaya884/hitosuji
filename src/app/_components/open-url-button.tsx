"use client";

import type { MouseEvent } from "react";
import { ExternalLinkIcon } from "@/app/_components/icons";
import { openInNewTab } from "@/app/_lib/open-url";

type Props = Readonly<{
  url: string;
  /** 開く以外に呼び出し側が添える処理（デイリーでは行の選択をその行へ移す。画面定義書01 §3.3） */
  onClick?: () => void;
  /** 文字色（置かれる行のモード色・弱め方に従う）。余白・並びは部品側が持つ */
  colorClass: string;
}>;

/**
 * 参照先 URL の印（F-125 / 画面定義書01 §3.3 / 画面定義書02 §3）。**クリックは新しいタブに開くだけ**で
 * 開始打刻はしない。URL の文字列は行に見せない（読むものではなく開くもの）——**ツールチップ
 * （`title`）でだけ**行き先を確かめられる。行の中に置かれるので、クリックを行へ伝播させない
 * （打刻ボタン・⭐と同じ手当て）
 */
export function OpenUrlButton({ url, onClick, colorClass }: Props) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onClick?.();
    openInNewTab(url);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="URL を開く"
      title={url}
      // 隣の印（コメント印・⭐）と同じ余白・縦位置に並べる。アイコンだけのボタンはホバーで文字色を変える（00_共通 §2.5）
      className={`ml-2 inline-flex align-middle hover:text-accent ${colorClass}`}
    >
      <ExternalLinkIcon className="h-4 w-4" />
    </button>
  );
}
