// タスク状態は状態カラムを持たず打刻から導出する（データモデル定義書 §3.5、CLAUDE.md 設計原則）
export type TaskStatus = "not_started" | "running" | "completed";

export type TaskPunch = Readonly<{
  startedAt: Date | null;
  endedAt: Date | null;
}>;

export function taskStatus(punch: TaskPunch): TaskStatus {
  if (punch.endedAt !== null) return "completed";
  if (punch.startedAt !== null) return "running";
  return "not_started";
}
