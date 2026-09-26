// ルーチンからタスクへ写す内容（データモデル定義書 §4.1-3 / 要件定義書 §5.3 F-307）
import type { BundleId } from "../bundle/bundle";
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
import type { Routine } from "./routine";

/**
 * 展開（データモデル定義書 §4.1）と手動コピー（F-307）が共通で写す内容。
 * **配置（セクション・並び順）と `routineId` は含めない**——そこだけが2つの生成契機で違う:
 * 展開は開始想定時刻の属するセクションへ置いてルーチンに紐付け、コピーは未分類の末尾へ
 * 置いて紐付けない（データモデル定義書 §3.5）。
 * **`routines` に列が増えたときここへ足すかは、展開とコピーの両方で写す値かで決める**
 */
export type RoutineTaskContent = Readonly<{
  name: string;
  estimateMinutes: number;
  modeId: ModeId | null;
  projectId: ProjectId | null;
  bundleId: BundleId | null;
  url: string | null;
}>;

export function routineTaskContent(routine: Routine): RoutineTaskContent {
  return {
    name: routine.name,
    estimateMinutes: routine.estimateMinutes,
    modeId: routine.modeId,
    projectId: routine.projectId,
    bundleId: routine.bundleId,
    url: routine.url,
  };
}
