// デイリーリストの表示順（画面定義書01 §3.2 / データモデル定義書 §3.5）
// 表示順は「セクション（start_time 順）→ sort_order」。未分類はリスト先頭のインボックス
import { byDayStartOrder, dayStartTimeOf, sectionRanges, type Section } from "../section/section";
import { actualMinutes, type Task, type TaskId } from "./task";

export type DailyGroup = Readonly<{
  /** null = 未分類（インボックス） */
  section: Section | null;
  /** セクション枠の終了時刻。未分類とアーカイブ済みセクションでは導出できないので null */
  endTime: string | null;
  tasks: readonly Task[];
}>;

function bySortOrder(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * タスクをセクションごとにまとめる（§3.2）。
 * - 未分類（section_id なし）は先頭。0件でも常に表示する（インボックスの受け皿のため）
 * - 有効なセクションはタスク0件でも常に表示する
 * - アーカイブ済みセクションは当日タスクが属している場合のみ表示する
 */
export function groupTasksBySection(
  tasks: readonly Task[],
  sections: readonly Section[]
): DailyGroup[] {
  const endTimeOf = new Map(sectionRanges(sections).map((r) => [r.section.id, r.endTime]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  // タスクが属しているアーカイブ済みセクション（有効セクションは無条件で表示する）
  const usedArchived = [...new Set(tasks.map((t) => t.sectionId))]
    .filter((id): id is number => id !== null)
    .map((id) => sectionById.get(id))
    .filter((s): s is Section => s !== undefined && s.isArchived);

  // 表示順は日界セクションを先頭にした回転（F-116 / §3.1）。日界 00:00（既定）なら start_time 昇順に一致する
  const shown = [...sections.filter((s) => !s.isArchived), ...usedArchived].sort(
    byDayStartOrder(dayStartTimeOf(sections))
  );

  const groups: DailyGroup[] = shown.map((section) => ({
    section,
    endTime: endTimeOf.get(section.id) ?? null,
    tasks: bySortOrder(tasks.filter((t) => t.sectionId === section.id)),
  }));

  return [
    { section: null, endTime: null, tasks: bySortOrder(tasks.filter((t) => t.sectionId === null)) },
    ...groups,
  ];
}

/**
 * セクションの時間合計（分）。F-110 の「合計 2:30/3:00」の分子。
 * 完了タスクは実績、未完了（実行中・未実行）は見積もりを合算する（画面定義書01 §3.2）。
 * 実行中は見積もりで数え、完了打刻で実績へ切り替わる（actualMinutes は完了時のみ非null）
 */
export function sectionTotalMinutes(tasks: readonly Task[]): number {
  return tasks.reduce((sum, t) => sum + (actualMinutes(t) ?? t.estimateMinutes), 0);
}

/**
 * タスク進捗（F-114）。セクション見出し（画面定義書01 §3.2）と
 * 1日全体のサマリ行（§3.1）で共用する。
 * 実施済み＝完了（ended_at あり）で数え、実行中は含めない（件数ベース）
 */
export function taskProgress(tasks: readonly Task[]): Readonly<{ done: number; total: number }> {
  return { done: tasks.filter((t) => t.endedAt !== null).length, total: tasks.length };
}

/**
 * 未分類グループの末尾へタスクを差し込んだ新しいグループ列を返す（画面定義書01 §3.4 の配置先）。
 * 楽観的更新（N-01）で、永続化を待たずに追加を画面へ反映するために使う純関数
 */
export function withTaskAppended(
  groups: readonly DailyGroup[],
  task: Task
): DailyGroup[] {
  const unclassified = groups.find((g) => g.section === null);
  if (unclassified === undefined) {
    return [{ section: null, endTime: null, tasks: [task] }, ...groups];
  }
  return groups.map((g) =>
    g === unclassified ? { ...g, tasks: [...g.tasks, task] } : g
  );
}

/**
 * 指定タスクを差し替えた新しいグループ列を返す（楽観的更新のインライン編集用）。
 * 並び順は変えない（編集で位置は動かない）
 */
export function withTaskUpdated(
  groups: readonly DailyGroup[],
  taskId: TaskId,
  update: (task: Task) => Task
): DailyGroup[] {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((t) => (t.id === taskId ? update(t) : t)),
  }));
}

/**
 * タスクを移動したグループ列を返す（楽観的更新の並び替え用）。
 * 実際の sort_order 採番はサーバが確定するので、ここでは表示上の並びだけを作る
 */
export function withTaskMoved(
  groups: readonly DailyGroup[],
  taskId: TaskId,
  destination: Readonly<{ sectionId: number | null; index: number }>
): DailyGroup[] {
  const moving = groups.flatMap((g) => g.tasks).find((t) => t.id === taskId);
  if (moving === undefined) return [...groups];

  const removed = groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== taskId) }));
  const moved = { ...moving, sectionId: destination.sectionId };

  const target = removed.find((g) => (g.section?.id ?? null) === destination.sectionId);
  if (target === undefined) {
    // 移動先グループが画面に無い（0件だった）場合は表示を変えずサーバ確定を待つ
    return [...groups];
  }

  const index = Math.max(0, Math.min(destination.index, target.tasks.length));
  return removed.map((g) =>
    g === target
      ? { ...g, tasks: [...g.tasks.slice(0, index), moved, ...g.tasks.slice(index)] }
      : g
  );
}

/**
 * 1日のタスクを表示順（セクション → sort_order）に並べる。
 * 複製の挿入位置（F-111）のように、リスト全体の並びが要る処理で使う
 */
export function orderTasksForDisplay(
  tasks: readonly Task[],
  sections: readonly Section[]
): Task[] {
  return groupTasksBySection(tasks, sections).flatMap((g) => g.tasks);
}
