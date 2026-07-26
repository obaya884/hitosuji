// 楽観的更新の状態遷移。表示日1日分のグループを受けて次のグループを返すだけなので、
// コンポーネントから切り出して純関数にする（アーキテクチャ定義書 §8）。
import {
  withTaskAppended,
  withTaskMoved,
  withTaskRemoved,
  withTaskUpdated,
  type DailyGroup,
} from "@/domain/task/daily-list";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task } from "@/domain/task/task";

/**
 * 楽観的更新（N-01 / 00_共通 §4）: 永続化を待たずに画面へ反映し、失敗時はサーバ状態へ巻き戻す。
 * **どこまでを即時に反映するか**が仕様条項そのもの（並べ直しや割り込みはサーバ確定後）なので、
 * 各 case のコメントは条項の写しとして残す
 */
export type OptimisticAction =
  | Readonly<{ type: "append"; task: Task }>
  | Readonly<{ type: "rename"; id: number; name: string }>
  | Readonly<{ type: "estimate"; id: number; minutes: number }>
  | Readonly<{ type: "start"; id: number; at: Date }>
  | Readonly<{ type: "unstart"; id: number }>
  | Readonly<{ type: "uncomplete"; id: number }>
  | Readonly<{ type: "finish"; id: number; at: Date }>
  | Readonly<{ type: "punch"; id: number; startedAt: Date; endedAt: Date | null }>
  | Readonly<{
      type: "move";
      id: number;
      destination: Readonly<{ sectionId: number | null; index: number }>;
    }>
  | Readonly<{ type: "mode"; id: number; modeId: number | null }>
  | Readonly<{ type: "project"; id: number; projectId: number | null }>
  | Readonly<{ type: "remove"; id: number }>;

export function applyOptimisticAction(
  groups: readonly DailyGroup[],
  action: OptimisticAction
): DailyGroup[] {
  switch (action.type) {
    case "append":
      return withTaskAppended(groups, action.task);
    case "rename":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, name: action.name }));
    case "estimate":
      return withTaskUpdated(groups, action.id, (t) => ({
        ...t,
        estimateMinutes: action.minutes,
      }));
    // 割り込み時の「実行中タスクの終了・再開タスク生成」はサーバ確定後に反映される
    case "start":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, startedAt: action.at }));
    // 未実行への並べ直し（§4.5）はサーバ確定後に反映される。まず打刻だけ消す
    case "unstart":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, startedAt: null }));
    // 完了の取り消し（§4.7）も並べ直しはサーバ確定後。打刻2列のクリアだけ即時に反映する（O-15）
    case "uncomplete":
      return withTaskUpdated(groups, action.id, (t) => ({
        ...t,
        startedAt: null,
        endedAt: null,
      }));
    case "finish":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, endedAt: action.at }));
    case "punch":
      return withTaskUpdated(groups, action.id, (t) => ({
        ...t,
        startedAt: action.startedAt,
        endedAt: action.endedAt,
      }));
    case "move":
      return withTaskMoved(groups, action.id, action.destination);
    case "mode":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, modeId: action.modeId }));
    case "project":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, projectId: action.projectId }));
    case "remove":
      return withTaskRemoved(groups, action.id);
  }
}

/**
 * 楽観的更新で先に表示する仮タスク。負のIDでサーバ確定前だと分かるようにする。
 * ID は同一セッション内で衝突しなければよく、時刻の符号反転で足りる
 * （サーバの採番は必ず正のため、負であることがそのまま「未確定」の印になる）
 */
export function optimisticTask(
  date: LogicalDate,
  name: string,
  now: number = Date.now()
): Task {
  return {
    id: -now,
    taskDate: date,
    name,
    estimateMinutes: 0,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: Number.MAX_SAFE_INTEGER, // 未分類の末尾（§3.4）
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
  };
}
