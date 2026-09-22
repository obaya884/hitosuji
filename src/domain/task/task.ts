// タスク集約（データモデル定義書 §3.5）。プランとログを兼ねる中心テーブルの表現
import type { BundleId } from "../bundle/bundle";
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
import type { RoutineId } from "../routine/routine";
import type { SectionId } from "../section/section";
import { daysBetween, type LogicalDate } from "../shared/logical-date";

export type TaskId = number;

export type Task = Readonly<{
  id: TaskId;
  taskDate: LogicalDate;
  /** 最初に属した日（F-122）。生成時に taskDate と同値が入り、移動では変わらない */
  initialTaskDate: LogicalDate;
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

/** 実行済みタスク（`started_at` あり）。実績ログ・集計の母集団（画面定義書04 §3.3） */
export type StartedTask = Task & Readonly<{ startedAt: Date }>;

/**
 * 持ち越しの日数（F-122 / 画面定義書01 §3.3）。日付移動（O-7）で後ろへ移った分だけ増え、
 * 今日へ引き寄せた（F-123）ぶんだけ減る。**未来日から引き寄せた行では負になる**ので、
 * 0 以下は「持ち越していない」として扱う（表示の判定は `_lib/format.ts`）
 */
export function carryOverDays(task: Task): number {
  return daysBetween(task.initialTaskDate, task.taskDate);
}

/**
 * その日に生まれて後日へ持ち越されたか（F-502 / 画面定義書04 §3.4 ①）。打刻の有無は問わない。
 * 未来日から今日へ引き寄せた行（task_date < initial_task_date）は持ち越しではない
 */
export function isCarriedOverFrom(task: Task, date: LogicalDate): boolean {
  return task.initialTaskDate === date && task.taskDate > date;
}

/** ある日に残っている未実行タスクの件数（F-124 / 画面定義書01 §8 の警告バナーの1行） */
export type UnstartedCountByDate = Readonly<{ taskDate: LogicalDate; count: number }>;

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
