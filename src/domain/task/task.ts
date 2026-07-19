// タスク集約（データモデル定義書 §3.5）。プランとログを兼ねる中心テーブルの表現
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
import type { SectionId } from "../section/section";
import type { LogicalDate } from "../shared/logical-date";

export type TaskId = number;

export type Task = Readonly<{
  id: TaskId;
  taskDate: LogicalDate;
  name: string;
  estimateMinutes: number; // 0 = 未設定（画面定義書01 §3.3 で `--:--` 表示）
  sectionId: SectionId | null;
  modeId: ModeId | null;
  projectId: ProjectId | null;
  sortOrder: number;
  startedAt: Date | null;
  endedAt: Date | null;
  comment: string | null;
  routineId: number | null;
  splitParentId: TaskId | null;
  postponedCount: number;
}>;

/** 実績時間（分）。完了タスクのみ求まる（データモデル定義書 §3.5） */
export function actualMinutes(task: Task): number | null {
  if (task.startedAt === null || task.endedAt === null) return null;
  return Math.round((task.endedAt.getTime() - task.startedAt.getTime()) / 60000);
}

/** 実行中タスクの経過時間（分）。現在時刻は引数で受け取る（domain は now を持たない） */
export function elapsedMinutes(task: Task, now: Date): number | null {
  if (task.startedAt === null || task.endedAt !== null) return null;
  return Math.round((now.getTime() - task.startedAt.getTime()) / 60000);
}
