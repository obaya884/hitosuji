// デイリー配下のテスト（ユニット・コンポーネントとも）で使う DailyGroup の組み立て。
// Task そのものと打刻時刻は全層共通の `@/domain/task/testing/task` と
// `@/domain/shared/testing/clock` が持つ（T-43）。ここは表示単位（グループ）だけを扱う。
import type { Section } from "@/domain/section/section";
import type { DailyGroup } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";

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
