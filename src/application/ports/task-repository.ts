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
}>;

export type TaskRepository = Readonly<{
  /** 表示日1日分のみ取得する（画面定義書01 §7 / N-08） */
  listByDate(date: LogicalDate): Promise<Task[]>;
  create(input: NewTask): Promise<Task>;
  rename(id: TaskId, name: string): Promise<void>;
  updateEstimate(id: TaskId, estimateMinutes: number): Promise<void>;
}>;
