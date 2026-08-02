// 楽観的更新の状態遷移。表示日1日分のグループを受けて次のグループを返すだけなので、
// コンポーネントから切り出して純関数にする（テスト戦略定義書 §3）。
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
  | Readonly<{ type: "comment"; id: number; comment: string | null }>
  | Readonly<{ type: "highlight"; id: number; highlighted: boolean }>
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
    // コメント（O-16）。null なら未設定へ戻る＝印も消える
    case "comment":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, comment: action.comment }));
    // ハイライトは行の位置に影響しないので、印だけを差し替える（O-17 / F-118）
    case "highlight":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, highlighted: action.highlighted }));
    // 割り込み時の「実行中タスクの終了・再開タスク生成」はサーバ確定後に反映される
    case "start":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, startedAt: action.at }));
    // 未実行への並べ直し（データモデル定義書 §4.5）はサーバ確定後に反映される。まず打刻だけ消す
    case "unstart":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, startedAt: null }));
    // 完了の取り消し（データモデル定義書 §4.7）も並べ直しはサーバ確定後。打刻2列のクリアだけ即時に反映する（O-15）
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
 * 楽観的更新で先に表示する仮タスク。IDは符号を反転して負にする——サーバの採番は必ず正なので、
 * こうしておけば確定済みの行とぶつからない。
 *
 * `seq` は**そのボードが生きている間ずっと重複しない正の整数**（0 は `-0` になって負にならない）。
 * 呼び出し側が単調増加カウンタで採ること——重複すると片方への更新・削除が他方を巻き添えにする
 */
export function optimisticTask(date: LogicalDate, name: string, seq: number): Task {
  return {
    id: -seq,
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
    highlighted: false,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
  };
}
