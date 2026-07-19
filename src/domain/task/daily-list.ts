// デイリーリストの表示順（画面定義書01 §3.2 / データモデル定義書 §3.5）
// 表示順は「セクション（start_time 順）→ sort_order」。未分類はリスト先頭のインボックス
import { sectionRanges, sortByStartTime, type Section } from "../section/section";
import type { Task, TaskId } from "./task";

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
 * タスクをセクションごとにまとめる。
 * - 未分類（section_id なし）は先頭。0件なら表示しない（§3.2）
 * - セクション見出しは当日タスクが属するセクションのみ。アーカイブ済みでも表示する（§3.2）
 * - タスク0件の日は空配列を返す（空状態の表示は presentation の責務。§7）
 */
export function groupTasksBySection(
  tasks: readonly Task[],
  sections: readonly Section[]
): DailyGroup[] {
  const endTimeOf = new Map(sectionRanges(sections).map((r) => [r.section.id, r.endTime]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  const unclassified = tasks.filter((t) => t.sectionId === null);

  const usedSections = sortByStartTime(
    [...new Set(tasks.map((t) => t.sectionId))]
      .filter((id): id is number => id !== null)
      .map((id) => sectionById.get(id))
      .filter((s): s is Section => s !== undefined)
  );

  const groups: DailyGroup[] = usedSections.map((section) => ({
    section,
    endTime: endTimeOf.get(section.id) ?? null,
    tasks: bySortOrder(tasks.filter((t) => t.sectionId === section.id)),
  }));

  return unclassified.length > 0
    ? [{ section: null, endTime: null, tasks: bySortOrder(unclassified) }, ...groups]
    : groups;
}

/** セクションの見積もり合計（分）。F-110 の「見積 2:30/3:00」の分子 */
export function totalEstimateMinutes(tasks: readonly Task[]): number {
  return tasks.reduce((sum, t) => sum + t.estimateMinutes, 0);
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
