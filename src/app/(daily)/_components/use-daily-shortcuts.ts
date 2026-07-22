import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { addDays, type LogicalDate } from "@/domain/shared/logical-date";
import { currentTaskId, moveSelection } from "@/domain/task/selection";
import { taskStatus } from "@/domain/task/status";
import type { Task } from "@/domain/task/task";
import type { EditField, EditingCell } from "./daily-list";

/**
 * デイリー画面のグローバルキーボードショートカット（画面定義書01 §6）。
 * 挙動は daily-board 本体に埋め込まれていた useEffect と同一で、可読性のためフックへ切り出しただけ。
 * 状態と操作ハンドラを引数で受け取る「配線層」であり、依存配列を持たず毎レンダー登録し直して
 * 最新のクロージャを拾う点も従来どおり。
 */
export type DailyShortcutParams = Readonly<{
  editing: EditingCell | null;
  orderedTasks: readonly Task[];
  /** 表示時に導出された選択行 ID（keepSelection 後の値） */
  selectedId: number | null;
  deleted: Task | null;
  date: LogicalDate;
  quickAddRef: RefObject<HTMLInputElement | null>;
  router: Readonly<{ push: (href: string) => void }>;
  setEditing: Dispatch<SetStateAction<EditingCell | null>>;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  moveByStep: (step: 1 | -1) => void;
  punch: (task: Task) => void;
  operate: (task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") => void;
  unstart: (task: Task) => void;
  undoDelete: () => void;
}>;

export function useDailyShortcuts(params: DailyShortcutParams): void {
  const {
    editing,
    orderedTasks,
    selectedId,
    deleted,
    date,
    quickAddRef,
    router,
    setEditing,
    setShowHelp,
    setSelectedId,
    moveByStep,
    punch,
    operate,
    unstart,
    undoDelete,
  } = params;

  useEffect(() => {
    function onKeyDownGlobal(e: KeyboardEvent) {
      // テキスト入力中・IME変換中はショートカット無効（画面定義書01 §6）
      const target = e.target as HTMLElement | null;
      if (e.isComposing || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      // 編集中（インライン編集・選択ポップオーバー表示中）は行操作キーを無効化する。
      // ポップオーバーは J/K/Enter を自前で拾うため、ここで素通しさせない（F-112）
      if (editing !== null) return;
      // 修飾キーは Shift のみ使用する（§6）。Cmd/Ctrl 併用時はブラウザの既定動作に任せる
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const selected = orderedTasks.find((t) => t.id === selectedId) ?? null;
      const requestEdit = (field: EditField) => {
        if (selected === null) return;
        // 押したキー自体が編集欄へ入力されないように既定動作を止める
        e.preventDefault();
        setEditing({ taskId: selected.id, field });
      };

      // ? は Shift+/ で入力されるため、Shift 分岐より先に処理する
      if (e.key === "?") {
        setShowHelp((v) => !v);
        return;
      }

      if (e.shiftKey) {
        switch (e.key) {
          case "J":
            moveByStep(1);
            return;
          case "K":
            moveByStep(-1);
            return;
          case "H":
            router.push(`/?date=${addDays(date, -1)}`);
            return;
          case "L":
            router.push(`/?date=${addDays(date, 1)}`);
            return;
          default:
            return;
        }
      }

      switch (e.key) {
        // 選択行の移動（§5。矢印キーは割り当てず J/K のみ。FB-33）
        case "j":
          setSelectedId((current) => moveSelection(orderedTasks, current, 1));
          return;
        case "k":
          setSelectedId((current) => moveSelection(orderedTasks, current, -1));
          return;
        case "c": // 現在地へジャンプ（§5）
          setSelectedId(currentTaskId(orderedTasks));
          return;
        case "Enter":
          // ボタンにフォーカスが残っている場合はブラウザがそのボタンを押すので、
          // ここで打刻すると二重に発火する（打刻ボタンを押した直後など）
          if (target?.tagName === "BUTTON") return;
          if (selected !== null) punch(selected); // 開始 →（実行中なら）終了
          return;
        case "i":
          if (selected !== null) operate(selected, "suspend");
          return;
        case "y":
          if (selected !== null) operate(selected, "duplicate");
          return;
        case "d":
          if (selected !== null) operate(selected, "delete");
          return;
        case "u":
          // 直前の削除の取り消しが保留中（Undoトースト表示中）ならそれを優先する。
          // 削除すると選択が現在地（実行中タスク）へ移るため、優先しないと U が開始取消に化ける（FB-37 動作確認）。
          // 保留がなく実行中タスクを選択中なら開始の取り消し、それ以外は削除の取り消し（O-13）
          if (deleted === null && selected !== null && taskStatus(selected) === "running") {
            unstart(selected);
          } else {
            undoDelete();
          }
          return;
        case "t":
          router.push("/");
          return;
        case "a":
          e.preventDefault(); // 入力欄に "a" が入るのを防ぐ
          quickAddRef.current?.focus();
          return;
        case "r":
        case "F2":
          requestEdit("name");
          return;
        case "e":
          requestEdit("estimate");
          return;
        case "b":
          requestEdit("startedAt");
          return;
        case "f":
          requestEdit("endedAt");
          return;
        case "m":
          requestEdit("mode");
          return;
        case "p":
          requestEdit("project");
          return;
        case "s":
          requestEdit("section");
          return;
        default:
          return;
      }
    }

    window.addEventListener("keydown", onKeyDownGlobal);
    return () => window.removeEventListener("keydown", onKeyDownGlobal);
  });
}
