// 楽観的更新の状態遷移。表示日1日分のグループを受けて次のグループを返すだけなので、
// コンポーネントから切り出して純関数にする（テスト戦略定義書 §3）。
import {
  withTaskAppended,
  withTaskMoved,
  withTaskRemoved,
  withTaskUpdated,
  type DailyGroup,
} from "@/domain/task/daily-list";
import type { ModeId } from "@/domain/mode/mode";
import type { ProjectId } from "@/domain/project/project";
import type { SectionId } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { taskStatus } from "@/domain/task/status";
import type { Task, TaskId } from "@/domain/task/task";

/**
 * 楽観的更新（N-01 / 00_共通 §4）: 永続化を待たずに画面へ反映し、失敗時はサーバ状態へ巻き戻す。
 * **どこまでを即時に反映するか**が仕様条項そのもの（並べ直しや割り込みはサーバ確定後）なので、
 * 各 case のコメントは条項の写しとして残す
 */
export type OptimisticAction =
  | Readonly<{ type: "append"; task: Task }>
  | Readonly<{ type: "rename"; id: TaskId; name: string }>
  | Readonly<{ type: "estimate"; id: TaskId; minutes: number }>
  | Readonly<{ type: "comment"; id: TaskId; comment: string | null }>
  | Readonly<{ type: "highlight"; id: TaskId; highlighted: boolean }>
  | Readonly<{ type: "start"; id: TaskId; at: Date }>
  | Readonly<{ type: "unstart"; id: TaskId }>
  | Readonly<{ type: "uncomplete"; id: TaskId }>
  | Readonly<{ type: "finish"; id: TaskId; at: Date }>
  | Readonly<{ type: "punch"; id: TaskId; startedAt: Date; endedAt: Date | null }>
  | Readonly<{
      type: "move";
      id: TaskId;
      destination: Readonly<{ sectionId: SectionId | null; index: number }>;
    }>
  | Readonly<{ type: "mode"; id: TaskId; modeId: ModeId | null }>
  | Readonly<{ type: "project"; id: TaskId; projectId: ProjectId | null }>
  | Readonly<{ type: "remove"; id: TaskId }>;

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
    // 割り込み（O-2）では相手の実行中タスクも同じ時刻で終了させる——サーバが使う終了時刻は
    // この開始時刻そのもの（`usecases/task/punch-usecases.ts` の `startTask`）で、完了タスクは
    // 並びが動かない（画面定義書01 §4.2）ため確定結果と必ず一致する。相手の開始が `at` より
    // 後になることは無い（未来の時刻へは修正できない。§3.3）ので、負の実績を描くこともない。
    // 再開タスクの生成をはじめ、採番・配置を伴う反映はサーバ確定後になる
    case "start": {
      const interrupted = groups
        .flatMap((g) => g.tasks)
        .find((t) => t.id !== action.id && taskStatus(t) === "running");
      const groupsAfterInterrupt =
        interrupted === undefined
          ? groups
          : withTaskUpdated(groups, interrupted.id, (t) => ({ ...t, endedAt: action.at }));
      return withTaskUpdated(groupsAfterInterrupt, action.id, (t) => ({
        ...t,
        startedAt: action.at,
      }));
    }
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
    bundleId: null,
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
