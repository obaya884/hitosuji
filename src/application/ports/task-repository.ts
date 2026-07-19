import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";

/** 新規タスクの永続化入力（id・打刻・created_at 等は永続化側が決める） */
export type NewTask = Readonly<{
  taskDate: LogicalDate;
  name: string;
  estimateMinutes: number;
  sectionId: number | null;
  modeId: number | null;
  projectId: number | null;
  sortOrder: number;
  /** 中断・割り込みで生成された再開タスクの元タスク（F-204） */
  splitParentId?: TaskId | null;
}>;

/**
 * 開始打刻の命令（F-201）。割り込みがある場合、
 * 「実行中タスクの終了 → 再開タスクの生成 → 対象タスクの開始」を1トランザクションで行う
 */
export type StartCommand = Readonly<{
  taskId: TaskId;
  startedAt: Date;
  interruption: Readonly<{
    runningTaskId: TaskId;
    endedAt: Date;
    resumeTask: NewTask;
  }> | null;
}>;

/** 並び替えの命令（画面定義書01 O-6 / データモデル定義書 §3.5） */
export type MoveCommand = Readonly<{
  taskId: TaskId;
  sectionId: number | null;
  sortOrder: number;
  /** 中間値が尽きた場合の同一グループの振り直し */
  renumber: readonly Readonly<{ taskId: TaskId; sortOrder: number }>[] | null;
}>;

/** 中断（F-204）: 実行中タスクの終了と再開タスクの生成を1トランザクションで行う */
export type SuspendCommand = Readonly<{
  taskId: TaskId;
  endedAt: Date;
  resumeTask: NewTask;
}>;

export type TaskRepository = Readonly<{
  /** 表示日1日分のみ取得する（画面定義書01 §7 / N-08） */
  listByDate(date: LogicalDate): Promise<Task[]>;
  findById(id: TaskId): Promise<Task | null>;
  /** 実行中タスクは全日付を通じて最大1件（データモデル定義書 §3.5） */
  findRunning(): Promise<Task | null>;
  create(input: NewTask): Promise<Task>;
  rename(id: TaskId, name: string): Promise<void>;
  updateEstimate(id: TaskId, estimateMinutes: number): Promise<void>;
  start(command: StartCommand): Promise<void>;
  updatePunch(id: TaskId, punch: Readonly<{ startedAt: Date; endedAt: Date | null }>): Promise<void>;
  finish(id: TaskId, endedAt: Date): Promise<void>;
  /** 並び替え（O-6）。振り直しを伴う場合も1トランザクションで反映する */
  move(command: MoveCommand): Promise<void>;
  /** モード・プロジェクトの割り当て（O-5） */
  suspend(command: SuspendCommand): Promise<void>;
  delete(id: TaskId): Promise<void>;
  /** 削除の取り消し（O-8）。打刻を含めて復元する。id は採番し直される */
  restore(task: Omit<Task, "id">): Promise<Task>;
  /** 先送り（F-107）: task_date の付け替えと postponed_count の加算 */
  postpone(id: TaskId, input: Readonly<{ taskDate: LogicalDate; sortOrder: number }>): Promise<void>;
  updateClassification(
    id: TaskId,
    classification: Readonly<{ modeId?: number | null; projectId?: number | null }>
  ): Promise<void>;
}>;
