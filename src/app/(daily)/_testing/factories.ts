// デイリー配下のテスト（ユニット・コンポーネントとも）で使う DailyGroup の組み立てと、
// 表（DailyList / GroupHeading / TaskRow）のテストが共有するマスタのフィクスチャ。
// Task そのものと打刻時刻は全層共通の `@/domain/task/testing/task` と
// `@/domain/shared/testing/clock` が持つ（T-43）。ここが扱うのは表示単位（グループ）と、
// デイリー画面でしか意味を持たないマスタの並びだけ（表の DOM 読み取りは `table-helpers.ts`）。
// セクションの時間帯は `SECTIONS` の `startTime` だけが持ち、枠の終了時刻は `sectionRanges` で
// そこから導く（T-82）。**`sectionRanges` から枠を導く実装（`groupTasksBySection`・`toSectionOptions`）の
// 出力と突き合わせる期待値には、ここの枠を使わずリテラルを書く**（同じ導出なので枠の検証が自明になる）。
import { MODE_COLOR_PRESETS, type Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { sectionRanges, type Section } from "@/domain/section/section";
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

/**
 * セクションのグループ。枠の終了時刻は呼び出し側が渡す（アーカイブ済みセクションでは
 * 枠が導出できないので null）。
 * `SECTIONS` の3つを組むときは枠が導出される `morning` / `forenoon` / `afternoon` を使い、
 * ここへ直に渡すのは**フィクスチャ外のセクションや任意の時間帯**を置きたいときだけにする
 */
export function sectionGroup(
  section: Section,
  endTime: string | null,
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

/** マスタを名前で引く（添字だと並び替えで意味が変わり、どのマスタの話か読めない） */
function masterOf<T extends { name: string }>(
  kind: string,
  masters: readonly T[],
  name: string
): T {
  const master = masters.find((m) => m.name === name);
  if (master === undefined) throw new Error(`${kind}「${name}」がフィクスチャにありません`);
  return master;
}

/** モードを名前で引く */
export function modeOf(name: string): Mode {
  return masterOf("モード", MODES, name);
}

/** プロジェクトを名前で引く */
export function projectOf(name: string): Project {
  return masterOf("プロジェクト", PROJECTS, name);
}

/** セクションを名前で引く */
export function sectionOf(name: string): Section {
  return masterOf("セクション", SECTIONS, name);
}

/** モードの色を名前で引く（jsdom が返す `rgb()` 表記） */
export function colorOf(name: string): string {
  return rgbOf(modeOf(name).color);
}

/** 有効セクションの枠（アーカイブ済みは `sectionRanges` が落とす） */
const SECTION_RANGES = sectionRanges(SECTIONS);

/** セクションを名前で引き、導出した枠でグループにする（名前で引く理由は `masterOf` と同じ） */
function derivedSectionGroup(name: string, tasks: readonly Task[]): DailyGroup {
  const range = SECTION_RANGES.find((r) => r.section.name === name);
  if (range === undefined) throw new Error(`有効セクション「${name}」がフィクスチャにありません`);
  return sectionGroup(range.section, range.endTime, tasks);
}

/** 朝のグループ */
export function morning(tasks: readonly Task[] = []): DailyGroup {
  return derivedSectionGroup("朝", tasks);
}

/** 午前のグループ */
export function forenoon(tasks: readonly Task[] = []): DailyGroup {
  return derivedSectionGroup("午前", tasks);
}

/** 午後のグループ。末尾のセクションなので日界をまたぐ枠になる */
export function afternoon(tasks: readonly Task[] = []): DailyGroup {
  return derivedSectionGroup("午後", tasks);
}
