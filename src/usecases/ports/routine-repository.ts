import type { ModeId } from "@/domain/mode/mode";
import type { ProjectId } from "@/domain/project/project";
import type { Routine, RoutineId } from "@/domain/routine/routine";
import type { ValidRoutineInput } from "@/domain/routine/input";
import type { SectionId } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";

/** 展開で生成するタスク（データモデル定義書 §4.1-3） */
export type RoutineTaskSeed = Readonly<{
  routineId: RoutineId;
  taskDate: LogicalDate;
  name: string;
  estimateMinutes: number;
  sectionId: SectionId | null;
  modeId: ModeId | null;
  projectId: ProjectId | null;
  sortOrder: number;
}>;

export type RoutineRepository = Readonly<{
  listAll(): Promise<Routine[]>;
  findById(id: RoutineId): Promise<Routine | null>;
  create(input: ValidRoutineInput): Promise<Routine>;
  update(id: RoutineId, input: ValidRoutineInput): Promise<void>;
  setActive(id: RoutineId, isActive: boolean): Promise<void>;
  /** 削除しても展開済みタスクは routine_id を NULL にして残る（画面定義書02 O-4） */
  delete(id: RoutineId): Promise<void>;
  /**
   * 展開タスクを冪等に INSERT する（F-301）。
   * `ON CONFLICT (routine_id, task_date) DO NOTHING` で既展開分は無視される
   */
  expand(seeds: readonly RoutineTaskSeed[]): Promise<number>;
  /** 指定日にスキップされているルーチン（F-301 / データモデル定義書 §3.6） */
  listSkippedOn(date: LogicalDate): Promise<RoutineId[]>;
}>;
