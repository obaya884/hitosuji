"use client";

import type { ReactNode } from "react";
import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import type { Task } from "@/domain/task/task";
import { modeAppearance } from "@/app/_lib/mode-appearance";
import { rowBackgroundClass } from "../_lib/row-background";
import { BundleRoadCell } from "./bundle-road-cell";

export type DetailRowProps = Readonly<{
  task: Task;
  /** バンドルの道（F-119 / §3.3）。2段で1件のタスクなので面と同じく帯もタスク行から伸ばす */
  bundle: Bundle | null;
  mode?: Mode;
  isSelected: boolean;
  /** この行の下にさらに2段目が続くか（コメント行の下に URL の入力行が開く場合）。続くなら下線を譲る */
  hasFollowingRow?: boolean;
  children: ReactNode;
}>;

/**
 * タスク行の直下に開く2段目の行の外殻（コメント行 O-16 / URL の入力行 O-18）。
 * 地色・モード色・バンドルの道・列の敷き方（打刻ボタン列を空け、内容はタスク名列の幅、
 * 右側は空セルで埋める）を1か所に持ち、中身だけを差し替える。**2段で1件のタスク**なので
 * タスク行と同じ規則で面色を決め、最後の2段目だけが下線を持つ（画面定義書01 §3.3）
 */
export function DetailRow({
  task,
  bundle,
  mode,
  isSelected,
  hasFollowingRow = false,
  children,
}: DetailRowProps) {
  const { colorStyle } = modeAppearance(mode);

  return (
    <tr
      style={colorStyle}
      className={`${hasFollowingRow ? "" : "border-b border-line"} ${rowBackgroundClass(task, isSelected)}`}
    >
      <BundleRoadCell bundle={bundle} />
      <td />
      <td className="pb-2.5">{children}</td>
      {/* 表の列数（daily-list.tsx の colgroup）と揃える。ずれると選択行の面色が途中で切れる */}
      <td colSpan={6} />
    </tr>
  );
}
