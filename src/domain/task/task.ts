// タスク集約（データモデル定義書 §3.5）。プランとログを兼ねる中心テーブルの表現
import type { BundleId } from "../bundle/bundle";
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
import type { RoutineId } from "../routine/routine";
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
  /** 属するバンドル（F-119）。ルーチン展開時に routine.bundleId を写す。単発タスクは null */
  bundleId: BundleId | null;
  sortOrder: number;
  startedAt: Date | null;
  endedAt: Date | null;
  comment: string | null;
  highlighted: boolean; // その日注力する印（F-118）。導出できないユーザーの宣言
  routineId: RoutineId | null;
  splitParentId: TaskId | null;
  postponedCount: number;
}>;

/**
 * 実績時間（分）。完了タスクのみ求まる（データモデル定義書 §3.5）。
 * 満たない分は切り捨てる（画面定義書01 §3.3: 1分未満の実績は 0:00 と表示する）
 */
export function actualMinutes(task: Task): number | null {
  if (task.startedAt === null || task.endedAt === null) return null;
  return Math.floor((task.endedAt.getTime() - task.startedAt.getTime()) / 60000);
}

/**
 * 実行中タスクの経過時間（分）。現在時刻は引数で受け取る（domain は now を持たない）。
 * 実績と同じく切り捨て（「n分経過」は n 分を満たしてから表示する）。
 * 打刻直後にクライアント時計のズレで now が開始時刻より前になっても負値は返さず 0 とする（FB-28）
 */
export function elapsedMinutes(task: Task, now: Date): number | null {
  if (task.startedAt === null || task.endedAt !== null) return null;
  return Math.max(0, Math.floor((now.getTime() - task.startedAt.getTime()) / 60000));
}
