import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { addDays, type LogicalDate } from "@/domain/shared/logical-date";
import { currentTaskId, moveSelection } from "@/domain/task/selection";
import { taskStatus } from "@/domain/task/status";
import type { Task } from "@/domain/task/task";
import { isButtonTarget, isGlobalShortcutEvent } from "@/app/_lib/keyboard";
import type { EditField, EditingCell } from "./daily-list";

/**
 * デイリー画面のグローバルキーボードショートカット（画面定義書01 §6）。
 * 挙動は daily-board 本体に埋め込まれていた useEffect と同一で、可読性のためフックへ切り出しただけ。
 * 状態と操作ハンドラを引数で受け取る「配線層」であり、依存配列を持たず毎レンダー登録し直して
 * 最新のクロージャを拾う点も従来どおり。
 */
export type DailyShortcutParams = Readonly<{
  editing: EditingCell | null;
  /** datepicker（F-117）の表示中は行操作キーを無効化する（背後へ流さない。§6） */
  pickerOpen: boolean;
  orderedTasks: readonly Task[];
  /** 表示時に導出された選択行 ID（keepSelection 後の値） */
  selectedId: number | null;
  /** 取り消しの保留（Undoトースト表示中）があるか。`U` の切り分けで最優先する（O-13） */
  hasPendingUndo: boolean;
  date: LogicalDate;
  quickAddRef: RefObject<HTMLInputElement | null>;
  router: Readonly<{ push: (href: string) => void }>;
  setEditing: Dispatch<SetStateAction<EditingCell | null>>;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  /** `G`（Go to date）で datepicker を開く（§3.1 / §6） */
  openDatePicker: () => void;
  moveByStep: (step: 1 | -1) => void;
  punch: (task: Task) => void;
  operate: (task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") => void;
  unstart: (task: Task) => void;
  uncomplete: (task: Task) => void;
  undoPending: () => void;
}>;

export function useDailyShortcuts(params: DailyShortcutParams): void {
  const {
    editing,
    pickerOpen,
    orderedTasks,
    selectedId,
    hasPendingUndo,
    date,
    quickAddRef,
    router,
    setEditing,
    setShowHelp,
    setSelectedId,
    openDatePicker,
    moveByStep,
    punch,
    operate,
    unstart,
    uncomplete,
    undoPending,
  } = params;

  useEffect(() => {
    function onKeyDownGlobal(e: KeyboardEvent) {
      // IME変換中・修飾キー併用・テキスト入力中はショートカット無効（00_共通 §3 / 画面定義書01 §6）
      if (!isGlobalShortcutEvent(e)) return;
      // 編集中（インライン編集・選択ポップオーバー表示中）は行操作キーを無効化する。
      // ポップオーバーは J/K/Enter を自前で拾うため、ここで素通しさせない（F-112）
      if (editing !== null) return;
      // datepicker 表示中も同様。カレンダーが自前で拾うキー以外を背後へ流さない（§3.1 / §6）
      if (pickerOpen) return;

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
          // ここで打刻すると二重に発火する（打刻ボタンを押した直後など。00_共通 §3）
          if (isButtonTarget(e.target)) return;
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
        case "u": {
          // 取り消しの保留（削除 O-8 / 完了の取り消し O-15）が Undoトースト表示中ならそれを最優先する。
          // 削除すると選択が現在地（実行中タスク）へ移るため、優先しないと U が開始取消に化ける（FB-37 動作確認）
          if (hasPendingUndo) {
            undoPending();
            return;
          }
          // 保留がなければ選択行の状態で切り分ける（O-13）。未実行タスクの選択中は何もしない
          if (selected === null) return;
          const status = taskStatus(selected);
          if (status === "running") unstart(selected);
          else if (status === "completed") uncomplete(selected);
          return;
        }
        case "t":
          router.push("/");
          return;
        case "g": // 日付を選んでジャンプ（datepicker を開く。§3.1 / §6）
          e.preventDefault();
          openDatePicker();
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
