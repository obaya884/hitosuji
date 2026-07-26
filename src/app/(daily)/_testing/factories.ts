// デイリー配下のコンポーネントテストで使うテストデータの組み立て。
// `as Task` のキャストで型を黙らせず、必要な項目だけを上書きして本物の型を作る。
// （全体での集約は T-43。ここはデイリー配下の重複をまとめる範囲に留める）
import type { Section } from "@/domain/section/section";
import type { DailyGroup } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";

/** 基準日。打刻時刻のヘルパー `at` と既定の `taskDate` を揃える */
export const TEST_DATE = "2026-07-26";

export function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: TEST_DATE,
    name: `T${over.id}`,
    estimateMinutes: 0,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: over.id * 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

/**
 * JST の `HH:MM` を打刻時刻の Date にする。
 * 打刻の表示（`formatClock`）は JST 固定なので、実行環境のタイムゾーンに依らせない
 * （終了予定・セクション残り時間はランタイムのローカル時刻基準なので、そちらは
 * `new Date(2026, 6, 26, 7, 0)` のようにローカルで組む）
 */
export function at(hhmm: string, date: string = TEST_DATE): Date {
  return new Date(`${date}T${hhmm}:00+09:00`);
}

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
