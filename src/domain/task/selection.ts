// 行選択モデル（画面定義書01 §5）
// リスト上に常に選択行が1つ存在し、各ショートカットは選択行に作用する
import type { SectionId } from "../section/section";
import { taskStatus } from "./status";
import type { Task, TaskId } from "./task";

/**
 * 「現在地」（§5）: 実行中タスク、なければ `firstNotStartedId` の探索順で決まる未実行タスク。
 * 初期選択と C キーのジャンプ先の両方に使う（同じ規則）
 */
export function currentTaskId(
  orderedTasks: readonly Task[],
  currentSectionId: SectionId | null
): TaskId | null {
  const running = orderedTasks.find((t) => taskStatus(t) === "running");
  if (running !== undefined) return running.id;

  return firstNotStartedId(orderedTasks, currentSectionId);
}

/**
 * 現在地の未実行タスク（§5 の規則 2〜4）: **現在セクション → 未分類 → 表示順全体**の順に探し、
 * 最初に見つかった未実行タスクを返す。素の表示順だけで探すと、リスト先頭（§3.2）の未分類に
 * 未実行が1件でもあれば常にそこへ当たり、トリアージ前のインボックスへ飛んでしまう（FB-78）。
 *
 * 未分類（規則3）に専用の分岐を持たないのは、**未分類が表示順の先頭にある**（§3.2）ため
 * 全体探索（規則4）がそのまま未分類を先に見るから。規則3 と規則4 の順序は自動的に満たされる。
 * `currentSectionId` が null（表示日が今日でない等、現在セクションが定まらない）のときは
 * 規則2 を飛ばし、表示順の先頭から探す。
 *
 * 終了打刻後の送り先（F-211）もこの探索そのもの——呼び出し側は楽観的更新の適用前スナップショットを
 * 渡すため終了したばかりのタスクはまだ実行中として含まれる。実行中を優先する `currentTaskId` だと
 * その行を選び直してしまうので、実行中を見ないこちらを使う
 */
export function firstNotStartedId(
  orderedTasks: readonly Task[],
  currentSectionId: SectionId | null
): TaskId | null {
  const notStarted = orderedTasks.filter((t) => taskStatus(t) === "not_started");

  if (currentSectionId !== null) {
    const inCurrentSection = notStarted.find((t) => t.sectionId === currentSectionId);
    if (inCurrentSection !== undefined) return inCurrentSection.id; // 規則2
  }

  return notStarted[0]?.id ?? null; // 規則3・規則4（未分類がリスト先頭なので同じ探索で足りる）
}

/** 選択行を1つ移動する（J/K・↑↓）。端では止まる */
export function moveSelection(
  orderedTasks: readonly Task[],
  selectedId: TaskId | null,
  step: 1 | -1
): TaskId | null {
  if (orderedTasks.length === 0) return null;
  if (selectedId === null) {
    return step === 1 ? orderedTasks[0].id : orderedTasks[orderedTasks.length - 1].id;
  }

  const index = orderedTasks.findIndex((t) => t.id === selectedId);
  if (index === -1) return orderedTasks[0].id;

  const next = index + step;
  if (next < 0 || next >= orderedTasks.length) return selectedId; // 端では動かさない
  return orderedTasks[next].id;
}

/** 選択が実在するタスクを指しているかを保つ（削除・日付移動の後に使う） */
export function keepSelection(
  orderedTasks: readonly Task[],
  selectedId: TaskId | null,
  currentSectionId: SectionId | null
): TaskId | null {
  if (selectedId !== null && orderedTasks.some((t) => t.id === selectedId)) return selectedId;
  return currentTaskId(orderedTasks, currentSectionId);
}
