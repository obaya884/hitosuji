import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";

/**
 * 採番の振り直し。挿入・移動と同じトランザクションで反映する（データモデル定義書 §3.5）。
 * **空配列＝振り直しなし**（「なにもしない」の表し方はこの1通りだけ）
 */
export type Renumber = readonly Readonly<{ taskId: TaskId; sortOrder: number }>[];

/** 特定日のルーチンスキップ（F-304 / データモデル定義書 §3.6） */
export type RoutineSkip = Readonly<{ routineId: number; taskDate: LogicalDate }>;

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
  /**
   * 開始したタスク自身の移動（F-113 / 画面定義書01 §4.2-a）。
   * started_at の書き込みと同一トランザクションで反映する
   */
  relocations: Relocations;
  interruption: Readonly<{
    runningTaskId: TaskId;
    endedAt: Date;
    resumeTask: NewTask;
    renumber: Renumber;
  }> | null;
}>;

/** 並び替えの命令（画面定義書01 O-6 / データモデル定義書 §3.5） */
export type MoveCommand = Readonly<{
  taskId: TaskId;
  sectionId: number | null;
  sortOrder: number;
  /** 中間値が尽きた場合の同一グループの振り直し */
  renumber: Renumber;
}>;

/**
 * 自動セクション移動（F-113 / データモデル定義書 §4.4）。
 * 複数行の section_id・sort_order をまとめて更新する。途中まで移動した状態を残さないため1トランザクション。
 * **空配列＝移動なし**（「なにもしない」の表し方はこの1通りだけ）
 */
export type Relocations = readonly Readonly<{
  taskId: TaskId;
  sectionId: number | null;
  sortOrder: number;
}>[];

/** 中断（F-204）: 実行中タスクの終了と再開タスクの生成を1トランザクションで行う */
export type SuspendCommand = Readonly<{
  taskId: TaskId;
  endedAt: Date;
  resumeTask: NewTask;
  /** 中間値が尽きた場合の同一グループの振り直し（データモデル定義書 §3.5） */
  renumber: Renumber;
}>;

/**
 * 複製して開始（F-208 / データモデル定義書 §4.6）。
 * 完了タスクの複製を開始済み（`startedAt`）で生成する。他に実行中タスクがあれば割り込みとして
 * 「実行中タスクの終了 → 再開タスクの生成 → 複製タスクの生成」を1トランザクションで行う。
 * 複製タスク・再開タスクはいずれもセクション末尾へ追加するため振り直しは伴わない
 */
export type DuplicateAndStartCommand = Readonly<{
  /** 複製する新タスク。`startedAt` を打刻して挿入する */
  newTask: NewTask;
  startedAt: Date;
  interruption: Readonly<{
    runningTaskId: TaskId;
    endedAt: Date;
    resumeTask: NewTask;
  }> | null;
}>;

export type TaskRepository = Readonly<{
  /** 表示日1日分のみ取得する（画面定義書01 §7 / N-08） */
  listByDate(date: LogicalDate): Promise<Task[]>;
  findById(id: TaskId): Promise<Task | null>;
  /** 実行中タスクは全日付を通じて最大1件（データモデル定義書 §3.5） */
  findRunning(): Promise<Task | null>;
  create(input: NewTask, renumber: Renumber): Promise<Task>;
  rename(id: TaskId, name: string): Promise<void>;
  updateEstimate(id: TaskId, estimateMinutes: number): Promise<void>;
  start(command: StartCommand): Promise<void>;
  /**
   * 打刻の修正（F-203）。開始時刻の修正に伴う移動（F-113 §4.2-c）があれば同一トランザクションで反映する。
   * 完了の取り消しの復帰（F-212 / データモデル定義書 §4.7）も、打刻2列＋配置2列の書き戻しとしてここを使う
   */
  updatePunch(
    id: TaskId,
    punch: Readonly<{ startedAt: Date; endedAt: Date | null }>,
    relocations: Relocations
  ): Promise<void>;
  finish(id: TaskId, endedAt: Date): Promise<void>;
  /**
   * 開始打刻の取り消し（F-210 / データモデル定義書 §4.5）。`started_at` を null に戻す。
   * 未実行への並べ直し（今日のみ）があれば同一トランザクションで反映する
   */
  undoStart(id: TaskId, relocations: Relocations): Promise<void>;
  /**
   * 完了の取り消し（F-212 / データモデル定義書 §4.7）。`started_at`・`ended_at` をともに null に戻す。
   * 未実行への並べ直し（今日のみ）があれば同一トランザクションで反映する
   */
  undoComplete(id: TaskId, relocations: Relocations): Promise<void>;
  /** 並び替え（O-6）。振り直しを伴う場合も1トランザクションで反映する */
  move(command: MoveCommand): Promise<void>;
  /** 自動セクション移動（F-113）。まとめて1トランザクションで反映する */
  relocate(relocations: Relocations): Promise<void>;
  /** モード・プロジェクトの割り当て（O-5） */
  suspend(command: SuspendCommand): Promise<void>;
  /**
   * 複製して開始（F-208 / データモデル定義書 §4.6）。開始済みの複製タスクを生成する。
   * 割り込みを伴う場合も終了・再開タスク生成・複製生成を1トランザクションで行い、作られた複製タスクを返す
   */
  duplicateAndStart(command: DuplicateAndStartCommand): Promise<Task>;
  /**
   * 削除（O-8）。ルーチン由来のタスクを削除するときは、その日を再展開しないよう
   * スキップも同じトランザクションで記録する（F-304 / データモデル定義書 §3.6）
   */
  delete(id: TaskId, skip: RoutineSkip | null): Promise<void>;
  /**
   * 削除の取り消し（O-8）。打刻を含めて復元する。id は採番し直される。
   * スキップの記録があれば同じトランザクションで解除する
   */
  restore(task: Omit<Task, "id">, skip: RoutineSkip | null): Promise<Task>;
  /** 先送り（F-107）: task_date の付け替えと postponed_count の加算 */
  postpone(id: TaskId, input: Readonly<{ taskDate: LogicalDate; sortOrder: number }>): Promise<void>;
  updateClassification(
    id: TaskId,
    classification: Readonly<{ modeId?: number | null; projectId?: number | null }>
  ): Promise<void>;
}>;
