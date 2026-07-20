// 未実行タスクの自動セクション移動（F-113 / 画面定義書01 §4.2・データモデル定義書 §4.4）
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { planCarryOver } from "@/domain/task/relocation";

export type RelocationDeps = Readonly<{
  tasks: TaskRepository;
  sections: SectionRepository;
}>;

/**
 * 規則b（§4.2-b）: 現在位置より前の未実行タスクを繰り下げる。
 * 打刻時とデイリー表示時に呼ぶ。同じ状態に対して何度呼んでも結果は変わらない（冪等）
 */
export async function applyCarryOver(
  deps: RelocationDeps,
  input: Readonly<{ date: LogicalDate; today: LogicalDate; nowClock: string }>
): Promise<void> {
  // 過去日はログとして保全し、未来日は計画として尊重する（§4.2 の対象外）
  if (input.date !== input.today) return;

  const [tasks, sections] = await Promise.all([
    deps.tasks.listByDate(input.date),
    deps.sections.listAll(),
  ]);

  const plan = planCarryOver(tasks, sections, input.nowClock);
  if (plan.length === 0) return;

  await deps.tasks.relocate(plan);
}

/**
 * 打刻の後に呼ぶ版（画面定義書01 §4.2「移動に失敗したとき」）。
 * 並びの整形は補助的な処理なので、失敗しても打刻（記録）は成立させる。
 * 冪等なので、次の打刻またはデイリー表示時に再試行される
 */
export async function applyCarryOverAfterPunch(
  deps: RelocationDeps,
  input: Readonly<{ date: LogicalDate; today: LogicalDate; nowClock: string }>
): Promise<void> {
  try {
    await applyCarryOver(deps, input);
  } catch (error) {
    console.error("自動セクション移動に失敗しました（打刻は成立しています）", error);
  }
}
