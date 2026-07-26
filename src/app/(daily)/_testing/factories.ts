// デイリー配下のテスト（ユニット・コンポーネントとも）で使う DailyGroup の組み立てと、
// 表（DailyList / GroupHeading / TaskRow）のテストが共有するマスタのフィクスチャ。
// Task そのものと打刻時刻は全層共通の `@/domain/task/testing/task` と
// `@/domain/shared/testing/clock` が持つ（T-43）。ここは表示単位（グループ）だけを扱う。
import { MODE_COLOR_PRESETS, type Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Section } from "@/domain/section/section";
import type { DailyGroup } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";
import { rgbOf } from "@/app/_testing/dom";

/**
 * 未分類（インボックス）のグループ。時間帯の枠を持たない。
 * **リストに1つしか現れない**ので、複数グループを組みたいときは `sectionGroup` と混ぜる
 */
export function unclassifiedGroup(tasks: readonly Task[] = []): DailyGroup {
  return { section: null, endTime: null, tasks };
}

/** セクションのグループ。`endTime` は次セクション開始からの導出値（domain の `sectionRanges` と同じ） */
export function sectionGroup(
  section: Section,
  endTime: string,
  tasks: readonly Task[] = []
): DailyGroup {
  return { section, endTime, tasks };
}

export const MODES: readonly Mode[] = [
  { id: 1, name: "仕事", color: MODE_COLOR_PRESETS[0].value, isArchived: false },
  { id: 2, name: "生活", color: MODE_COLOR_PRESETS[5].value, isArchived: false },
  { id: 3, name: "旧モード", color: MODE_COLOR_PRESETS[8].value, isArchived: true },
];

export const PROJECTS: readonly Project[] = [
  { id: 11, name: "サイト改善", isArchived: false },
  { id: 12, name: "終わった案件", isArchived: true },
];

export const SECTIONS: readonly Section[] = [
  { id: 100, name: "朝", startTime: "06:00", isArchived: false, isDayStart: true },
  { id: 200, name: "午前", startTime: "09:00", isArchived: false },
  { id: 300, name: "午後", startTime: "13:00", isArchived: false },
];

/** モードを名前で引く（添字だと並び替えで意味が変わり、どのモードの話か読めない） */
export function modeOf(name: string): Mode {
  const mode = MODES.find((m) => m.name === name);
  if (mode === undefined) throw new Error(`モード「${name}」がフィクスチャにありません`);
  return mode;
}

/** モードの色を名前で引く（jsdom が返す `rgb()` 表記） */
export function colorOf(name: string): string {
  return rgbOf(modeOf(name).color);
}

/** 朝（06:00–09:00）のグループ */
export function morning(tasks: readonly Task[] = []): DailyGroup {
  return sectionGroup(SECTIONS[0], "09:00", tasks);
}

/** 午前（09:00–13:00）のグループ */
export function forenoon(tasks: readonly Task[] = []): DailyGroup {
  return sectionGroup(SECTIONS[1], "13:00", tasks);
}

/** 午後（13:00–翌06:00）のグループ。日界をまたぐ枠 */
export function afternoon(tasks: readonly Task[] = []): DailyGroup {
  return sectionGroup(SECTIONS[2], "06:00", tasks);
}
