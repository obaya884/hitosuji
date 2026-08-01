// デイリーリストの表示ユースケース（S-01 / 画面定義書01 §3）
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import type { ProjectRepository } from "@/usecases/ports/project-repository";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { byDayStartOrder, dayStartTimeOf, type Section } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { sortByName } from "@/domain/shared/name-order";
import { err, ok, type Result } from "@/domain/shared/result";
import { groupTasksBySection, type DailyGroup } from "@/domain/task/daily-list";
import { appendSortOrder } from "@/domain/task/sort-order";
import {
  normalizeComment,
  validateEstimateMinutes,
  validateTaskName,
  type TaskEditError,
} from "@/domain/task/edit";
import type { Task, TaskId } from "@/domain/task/task";

/**
 * タスクの編集（O-5 / O-16 / §3.3）で起こりうる失敗。入力の検証（`TaskEditError`）に加えて、
 * **対象がすでに存在しない**場合を含む——他の画面・端末で削除されたタスクへの更新は、
 * 1行も当たらないまま成功として返さない（画面定義書00_共通 §4.1）。
 * 打刻（`PunchUsecaseError`）・並び替え（`ReorderUsecaseError`）と同じ形で揃えてある
 */
export type TaskEditUsecaseError = TaskEditError | "task_not_found";

export type DailyListDeps = Readonly<{
  tasks: TaskRepository;
  sections: SectionRepository;
  modes: ModeRepository;
  projects: ProjectRepository;
}>;

export type DailyListView = Readonly<{
  date: LogicalDate;
  groups: readonly DailyGroup[];
  /** 表示日より前に放置されている実行中タスク（画面定義書01 §8 の警告バナー用） */
  staleRunningTask: Task | null;
  /** タスク行のモード色・プロジェクト名やポップオーバーの選択肢に使う（アーカイブ済みも含む） */
  modes: readonly Mode[];
  projects: readonly Project[];
  sections: readonly Section[];
}>;

export async function listDailyList(
  deps: DailyListDeps,
  date: LogicalDate
): Promise<DailyListView> {
  const [tasks, sections, modes, projects, running] = await Promise.all([
    deps.tasks.listByDate(date),
    deps.sections.listAll(),
    deps.modes.listAll(),
    deps.projects.listAll(),
    deps.tasks.findRunning(),
  ]);

  // 実行中タスクが表示日より前の日付にあるなら、終了打刻の失念として警告する（§8）
  const staleRunningTask = running !== null && running.taskDate < date ? running : null;

  // 選択肢・表示の並び順は name 昇順（モード・プロジェクト）/ セクションは日界起点の回転で見出しと揃える（F-116 / §3.2）
  return {
    date,
    groups: groupTasksBySection(tasks, sections),
    modes: sortByName(modes),
    projects: sortByName(projects),
    sections: [...sections].sort(byDayStartOrder(dayStartTimeOf(sections))),
    staleRunningTask,
  };
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

  const created = await repo.create(
    {
      taskDate: input.date,
      name,
      estimateMinutes: 0, // 見積もり未設定（§3.4 既定値）
      sectionId: null,
      modeId: null,
      projectId: null,
      sortOrder: appendSortOrder(unclassified),
    },
    [] // 末尾追加なので振り直しは伴わない
  );
  return ok(created);
}

/** タスク名のインライン編集（F-102 / 画面定義書01 §3.3） */
export async function renameTask(
  repo: TaskRepository,
  id: TaskId,
  name: string
): Promise<Result<TaskId, TaskEditUsecaseError>> {
  const validated = validateTaskName(name);
  if (!validated.ok) return validated;
  if ((await repo.findById(id)) === null) return err("task_not_found");
  await repo.rename(id, validated.value);
  return ok(id);
}

/** 見積もりのインライン編集（F-103 / 画面定義書01 §3.3。分の整数入力） */
export async function updateTaskEstimate(
  repo: TaskRepository,
  id: TaskId,
  rawMinutes: string
): Promise<Result<TaskId, TaskEditUsecaseError>> {
  const validated = validateEstimateMinutes(rawMinutes);
  if (!validated.ok) return validated;
  if ((await repo.findById(id)) === null) return err("task_not_found");
  await repo.updateEstimate(id, validated.value);
  return ok(id);
}

/**
 * コメントの編集（F-206 / 画面定義書01 O-16）。長さの制限がなく入力の失敗しようがないため、
 * 検証ではなく正規化（`normalizeComment`）だけを通す
 */
export async function updateTaskComment(
  repo: TaskRepository,
  id: TaskId,
  rawComment: string
): Promise<Result<TaskId, TaskEditUsecaseError>> {
  if ((await repo.findById(id)) === null) return err("task_not_found");
  await repo.updateComment(id, normalizeComment(rawComment));
  return ok(id);
}

/** モードの割り当て（O-5 / F-401）。null で未設定に戻す */
export async function setTaskMode(
  repo: TaskRepository,
  id: TaskId,
  modeId: number | null
): Promise<Result<TaskId, TaskEditUsecaseError>> {
  if ((await repo.findById(id)) === null) return err("task_not_found");
  await repo.updateClassification(id, { modeId });
  return ok(id);
}

/** プロジェクトの割り当て（O-5 / F-402）。null で未設定に戻す */
export async function setTaskProject(
  repo: TaskRepository,
  id: TaskId,
  projectId: number | null
): Promise<Result<TaskId, TaskEditUsecaseError>> {
  if ((await repo.findById(id)) === null) return err("task_not_found");
  await repo.updateClassification(id, { projectId });
  return ok(id);
}
