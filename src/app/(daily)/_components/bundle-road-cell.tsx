"use client";

import { useState } from "react";
import type { Bundle } from "@/domain/bundle/bundle";

/**
 * バンドルの道（F-119 / 画面定義書01 §3.3）。行の最左端の専用列に、バンドル色の縦帯を
 * 行の上下端いっぱいに伸ばす。同じバンドルの行が縦に続くとつながって1本の道に見える。
 * **隣接は見ない**——帯の意味は「つながり」ではなく「この行はこのバンドルの一員」。
 *
 * タスク行とコメント行（O-16）の両方がこれを描く（2段で1件のタスクなので面を割らない）。
 * 列幅は `daily-list.tsx` の colgroup が持つ（列幅は1箇所に集約する）
 */
export function BundleRoadCell({ bundle }: Readonly<{ bundle: Bundle | null }>) {
  const [hovered, setHovered] = useState(false);

  return (
    <td className="relative p-0">
      {bundle !== null && (
        <span
          data-testid="bundle-road"
          // 素の span（role=generic）に aria-label は禁止属性（axe-core aria-prohibited-attr）。
          // role="img" を持たせて名前付けを許す（review-board.tsx のハイライト印と同じ形）
          role="img"
          aria-label={bundle.name}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          // -bottom-px は行の下罫線の上まで伸ばして帯を途切れさせないため
          className="absolute inset-x-0 top-0 -bottom-px"
          style={{ backgroundColor: bundle.color }}
        />
      )}
      {/* 名前は乗せた瞬間に出す（§3.3）。見た目はモードのプリセット選択（color-picker.tsx）と同じ */}
      {bundle !== null && hovered && (
        <span
          role="tooltip"
          className="pointer-events-none absolute top-1/2 left-full z-20 ml-1 -translate-y-1/2 rounded-control bg-ink px-1.5 py-0.5 text-xs whitespace-nowrap text-paper"
        >
          {bundle.name}
        </span>
      )}
    </td>
  );
}
