// 複製（F-111 / 画面定義書01 O-11）
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
import { taskStatus } from "./status";
import type { Task } from "./task";

/** 複製で引き継ぐ内容。routine_id・split_parent_id・コメントは引き継がない（F-111） */
export type DuplicateDraft = Readonly<{
  name: string;
  estimateMinutes: number; // 満額を引き継ぐ
  modeId: ModeId | null;
  projectId: ProjectId | null;
}>;

export function duplicateDraft(original: Task): DuplicateDraft {
  return {
    name: original.name,
    estimateMinutes: original.estimateMinutes,
    modeId: original.modeId,
    projectId: original.projectId,
  };
}

/**
 * 挿入位置「未実施のトップ」を求める（F-111）。
 * 実行中タスクがあればその直後、なければ表示順で最初の未実行タスクの直前、
 * いずれもなければリスト末尾。**1日のリスト全体の表示順**に対して求める
 * （section_id は挿入位置のセクションに従うため、元タスクと別セクションになりうる）
 */
export function insertionIndexForDuplicate(orderedTasks: readonly Task[]): number {
  const runningIndex = orderedTasks.findIndex((t) => taskStatus(t) === "running");
  if (runningIndex !== -1) return runningIndex + 1;

  const firstNotStarted = orderedTasks.findIndex((t) => taskStatus(t) === "not_started");
  if (firstNotStarted !== -1) return firstNotStarted;

  return orderedTasks.length;
}
