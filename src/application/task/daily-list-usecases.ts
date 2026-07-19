// デイリーリストの表示ユースケース（S-01 / 画面定義書01 §3）
import type { ModeRepository } from "@/application/ports/mode-repository";
import type { ProjectRepository } from "@/application/ports/project-repository";
import type { SectionRepository } from "@/application/ports/section-repository";
import type { TaskRepository } from "@/application/ports/task-repository";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { err, ok, type Result } from "@/domain/shared/result";
import { groupTasksBySection, type DailyGroup } from "@/domain/task/daily-list";
import { appendSortOrder } from "@/domain/task/sort-order";
import {
  validateEstimateMinutes,
  validateTaskName,
  type TaskEditError,
} from "@/domain/task/task-edit";
import type { Task, TaskId } from "@/domain/task/task";

export type DailyListDeps = Readonly<{
  tasks: TaskRepository;
  sections: SectionRepository;
  modes: ModeRepository;
  projects: ProjectRepository;
}>;

export type DailyListView = Readonly<{
  date: LogicalDate;
  groups: readonly DailyGroup[];
  /** タスク行のモード色・プロジェクト名の解決に使う（アーカイブ済みも含む） */
  modes: readonly Mode[];
  projects: readonly Project[];
}>;

export async function listDailyList(
  deps: DailyListDeps,
  date: LogicalDate
): Promise<DailyListView> {
  const [tasks, sections, modes, projects] = await Promise.all([
    deps.tasks.listByDate(date),
    deps.sections.listAll(),
    deps.modes.listAll(),
    deps.projects.listAll(),
  ]);

  return { date, groups: groupTasksBySection(tasks, sections), modes, projects };
}

/**
 * クイック追加（F-102 / 画面定義書01 §3.4）。
 * タスク名のみを受け取り、未分類グループ（インボックス）の末尾へ未実行タスクとして追加する。
 * 空名は「何もしない」ではなくエラーとして返し、呼び出し側（UI）が握りつぶす（§8）
 */
export async function addTask(
  repo: TaskRepository,
  input: Readonly<{ date: LogicalDate; name: string }>
): Promise<Result<Task, "name_required">> {
  const name = input.name.trim();
  if (name === "") return err("name_required");

  const sameDay = await repo.listByDate(input.date);
  const unclassified = sameDay.filter((t) => t.sectionId === null).map((t) => t.sortOrder);

  const created = await repo.create({
    taskDate: input.date,
    name,
    estimateMinutes: 0, // 見積もり未設定（§3.4 既定値）
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: appendSortOrder(unclassified),
  });
  return ok(created);
}

/** タスク名のインライン編集（F-102 / 画面定義書01 §3.3） */
export async function renameTask(
  repo: TaskRepository,
  id: TaskId,
  name: string
): Promise<Result<TaskId, TaskEditError>> {
  const validated = validateTaskName(name);
  if (!validated.ok) return validated;
  await repo.rename(id, validated.value);
  return ok(id);
}

/** 見積もりのインライン編集（F-103 / 画面定義書01 §3.3。分の整数入力） */
export async function updateTaskEstimate(
  repo: TaskRepository,
  id: TaskId,
  rawMinutes: string
): Promise<Result<TaskId, TaskEditError>> {
  const validated = validateEstimateMinutes(rawMinutes);
  if (!validated.ok) return validated;
  await repo.updateEstimate(id, validated.value);
  return ok(id);
}
