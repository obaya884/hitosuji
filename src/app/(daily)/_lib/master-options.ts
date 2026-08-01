// モード列・プロジェクト列の選択ポップオーバー（画面定義書01 O-5 / §3.3）の候補づくり。
// 先頭の「なし」項目とアーカイブ済みマスタの除外（画面定義書03 §4）が仕様条項そのものなので、
// コンポーネントから切り出して純関数にする（テスト戦略定義書 §3「ユニットテスト」）。
// 対になるセクション側は `section-options.ts`。
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { PopoverOption } from "../_components/select-popover";

/**
 * モードの選択肢。候補に色を持たせる（ポップオーバーがカラーバーに使う。F-401）。
 * 並びは渡された順のまま（マスタ管理の並び順がそのまま候補順になる）
 */
export function toModeOptions(modes: readonly Mode[]): PopoverOption[] {
  return [
    { id: null, label: "モードなし" },
    ...modes
      .filter((mode) => !mode.isArchived)
      .map((mode) => ({ id: mode.id, label: mode.name, color: mode.color })),
  ];
}

/** プロジェクトの選択肢。プロジェクトは色を持たないので候補にも色を付けない */
export function toProjectOptions(projects: readonly Project[]): PopoverOption[] {
  return [
    { id: null, label: "プロジェクトなし" },
    ...projects
      .filter((project) => !project.isArchived)
      .map((project) => ({ id: project.id, label: project.name })),
  ];
}
