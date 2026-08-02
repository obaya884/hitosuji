"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import {
  currentSectionId as deriveCurrentSectionId,
  dayStartTimeOf,
  startMinutes,
  type Section,
} from "@/domain/section/section";
import { weekdayIndex, type LogicalDate } from "@/domain/shared/logical-date";
import { APP_TIME_ZONE } from "@/domain/shared/time-zone";
import type { DailyGroup } from "@/domain/task/daily-list";
import { stepMoveDestination } from "@/domain/task/reorder";
import { currentNotStartedId, keepSelection } from "@/domain/task/selection";
import { taskStatus } from "@/domain/task/status";
import { editEndedAt, editStartedAt } from "@/domain/task/punch-edit";
import { normalizeComment, validateEstimateMinutes, validateTaskName } from "@/domain/task/edit";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { Task } from "@/domain/task/task";
import { PlusIcon } from "@/app/_components/icons";
import { formatClock } from "@/app/_lib/format";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { inputBase } from "@/app/_lib/ui";
import { useNow } from "@/app/_lib/use-now";
import {
  addTaskAction,
  createRoutineFromTaskAction,
  deleteTaskAction,
  duplicateAndStartTaskAction,
  duplicateTaskAction,
  finishTaskAction,
  moveTaskByStepAction,
  postponeTaskAction,
  renameTaskAction,
  restoreCompletionAction,
  restoreTaskAction,
  suspendTaskAction,
  setTaskHighlightAction,
  setTaskModeAction,
  setTaskProjectAction,
  setTaskSectionAction,
  startTaskAction,
  undoCompleteAction,
  undoStartAction,
  updateTaskCommentAction,
  updateTaskEstimateAction,
  updateTaskPunchAction,
  type CreatingActionResult,
  type DailyActionResult,
} from "../actions";
import { callAction, handleActionFailure, type ActionFailure } from "@/app/_lib/action-result";
import { PUNCH_EDIT_MESSAGES, TASK_EDIT_MESSAGES } from "@/app/_lib/error-messages";
import type { EditingCell } from "../_lib/editing";
import {
  applyOptimisticAction,
  optimisticTask,
  type OptimisticAction,
} from "../_lib/optimistic";
import { pendingUndoMessage, type PendingUndo, type UndoTarget } from "../_lib/undo";
import { DailyList } from "./daily-list";
import { DailySummary } from "./daily-summary";
import { DateNav } from "@/app/_components/date-nav";
import { ShortcutHelp } from "./shortcut-help";
import { StaleRunningBanner } from "./stale-running-banner";
import { Toast } from "./toast";
import { useDailyShortcuts } from "./use-daily-shortcuts";

type Props = Readonly<{
  date: LogicalDate;
  /** 今日（日界考慮済み。F-116）。datepicker の「今日」強調に渡す（F-117） */
  today: LogicalDate;
  isToday: boolean;
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
  sections: readonly Section[];
  /** 前日以前に放置されている実行中タスク（画面定義書01 §8） */
  staleRunningTask: Task | null;
}>;

export function DailyBoard({
  date,
  today,
  isToday,
  groups,
  modes,
  projects,
  sections,
  staleRunningTask,
}: Props) {
  const [optimisticGroups, dispatchOptimistic] = useOptimistic(groups, applyOptimisticAction);
  const [name, setName] = useState("");
  const [rawSelectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // datepicker（F-117）の開閉。日付クリックと G（Go to date）の両方から開くため board で持つ
  const [showDatePicker, setShowDatePicker] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);
  // 固定領域の高さ。選択行のスクロール追従（§5）が固定領域の裏で止まらないようにするため実測する
  const stickyRef = useRef<HTMLDivElement>(null);
  const [stickyHeight, setStickyHeight] = useState(0);
  const router = useRouter();
  // 直前の操作の取り消し（削除 O-8 / 完了の取り消し O-15 で共通の1スロット。O-13）
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  // トーストを毎回作り直して表示時間をリセットするための連番（同じタスクへ連続で操作しても効くように）
  const pendingUndoSeq = useRef(0);
  // サーバ確定前の仮タスクIDの連番（`optimisticTask` の `seq`。契約はそちらの JSDoc）
  const optimisticTaskSeq = useRef(0);
  const [error, setError] = useState<string | null>(null);
  /** 完了通知（ルーチン化 O-12 など。画面定義書00_共通 §2.2） */
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 実行中タスクの経過（F-205）と終了予定時刻（F-104）のため毎分更新する。
  // 当日を表示していないときは終了予定を出さないので、実行中タスクがある場合のみ回す
  const hasRunning = optimisticGroups.some((g) =>
    g.tasks.some((t) => taskStatus(t) === "running")
  );
  const now = useNow(hasRunning || isToday);

  // 日界（分）。終了予定・セクション残りの起点を論理日の区切りに合わせる（F-116）
  const dayStartMinutes = useMemo(() => startMinutes(dayStartTimeOf(sections)), [sections]);

  // 固定領域の高さを実測する（内容で変わりうるので ResizeObserver で追う）
  useEffect(() => {
    const sticky = stickyRef.current;
    if (sticky === null) return;

    const observer = new ResizeObserver(() => setStickyHeight(sticky.offsetHeight));
    observer.observe(sticky);
    return () => observer.disconnect();
  }, []);

  // 表示順に並んだタスク（選択行モデルの基盤。画面定義書01 §5）
  const orderedTasks = useMemo(
    () => optimisticGroups.flatMap((g) => g.tasks),
    [optimisticGroups]
  );

  // 現在セクション（§4.3 の定義＝現在時刻を含むセクション）。現在地の探索（§5）と
  // 見出しの強調（F-121）の両方が要るので、sections 全体を持つここで1回だけ求めて配る
  const currentSectionId = deriveCurrentSectionId(sections, formatClock(now), isToday);

  // 選択行は描画時に導出する（§5）。未選択や、削除・日付移動で選択が消えた場合は
  // 「現在地」（§5 の規則）へ自動的に戻る
  const selectedId = keepSelection(orderedTasks, rawSelectedId, currentSectionId);

  /** 失敗したときの表示と後始末（規則は `handleActionFailure`）。巻き戻しは各操作が持つ */
  function showFailure(result: ActionFailure) {
    handleActionFailure(result, { setError, refresh: () => router.refresh() });
  }

  /**
   * 引数順は runSelectingCreated と揃えて action を先頭にする（読み違い防止）。
   * `optimistic` は即時反映するものがあるときだけ渡す（中断・先送り・ルーチン化は確定を待つ）。
   *
   * **成功時の追加処理は action の内側で結果を見て行い、失敗時の処理は `onFailure` で外へ出す**。
   * 非対称なのは安全のため——action が拒否されると内側の残りは実行されず（`callAction` が外で捕まえる）、
   * 失敗時の巻き戻しを内側に書くと通信断のときだけ巻き戻らない＝ FB-64 と同じ症状になる。
   * 成功時の処理は生成 id やスナップショットが要るので内側でよい（削除 O-8・完了の取り消し O-15）——
   * ただし**そこで投げると「保存に失敗しました」として報告される**（サーバは成功しているのに）ので、
   * 投げうる処理は置かない
   */
  function run(
    action: () => Promise<DailyActionResult>,
    optimistic?: OptimisticAction,
    onFailure?: () => void
  ) {
    setError(null);
    startTransition(async () => {
      if (optimistic !== undefined) dispatchOptimistic(optimistic);
      const result = await callAction(action);
      if (!result.ok) {
        onFailure?.();
        showFailure(result);
      }
    });
  }

  /**
   * 生成系（複製・複製して開始・クイック追加）の共通処理。採番をサーバが決めるため
   * 生成物の選択は確定後に寄せる（O-11）: 成功なら `createdId` へ選択を移し、失敗なら `setError`。
   * `optimistic` を渡すと確定前に楽観更新を反映する（クイック追加の即時表示用）
   */
  function runSelectingCreated(
    action: () => Promise<CreatingActionResult>,
    optimistic?: OptimisticAction
  ) {
    setError(null);
    startTransition(async () => {
      if (optimistic !== undefined) dispatchOptimistic(optimistic);
      const result = await callAction(action);
      if (result.ok) setSelectedId(result.createdId);
      else showFailure(result);
    });
  }

  /** 取り消しの保留を置く（共通の1スロットなので前の保留は置き換わる。O-13） */
  function holdUndo(undo: UndoTarget) {
    setPendingUndo({ ...undo, seq: ++pendingUndoSeq.current });
  }

  // §3.4: Enter で追加 → 欄はクリアし、追加したタスクを選択（FB-29）。連続入力は `A` で欄に戻る（§6）。
  // 空のままの Enter は何もしない。欄からのフォーカス外しは呼び出し側で行う（ref をレンダー中に読まない）
  function add() {
    const trimmed = name.trim();
    if (trimmed === "") return;

    setName("");
    // 追加行は楽観的に即表示し、確定後に追加したタスクを選択する（§3.4 / FB-29）
    runSelectingCreated(() => addTaskAction({ date, name: trimmed }), {
      type: "append",
      task: optimisticTask(date, trimmed, ++optimisticTaskSeq.current),
    });
  }

  function rename(task: Task, raw: string) {
    const validated = validateTaskName(raw);
    if (!validated.ok) return; // 空名は確定不可（§8）。編集は破棄して元の名前に戻る
    if (validated.value === task.name) return;

    run(
      () => renameTaskAction(task.id, validated.value),
      { type: "rename", id: task.id, name: validated.value }
    );
  }

  function setEstimate(task: Task, raw: string) {
    const validated = validateEstimateMinutes(raw);
    if (!validated.ok) {
      setError(TASK_EDIT_MESSAGES[validated.error]);
      return;
    }
    if (validated.value === task.estimateMinutes) return;

    run(
      () => updateTaskEstimateAction(task.id, raw),
      { type: "estimate", id: task.id, minutes: validated.value }
    );
  }

  /** コメントの編集（O-16 / F-206）。空で確定すればコメントを消す（長さの検証はない） */
  function setComment(task: Task, raw: string) {
    const comment = normalizeComment(raw);
    if (comment === task.comment) return;

    run(() => updateTaskCommentAction(task.id, raw), { type: "comment", id: task.id, comment });
  }

  /** ハイライトの付け外し（O-17 / F-118）。状態・日付を問わないトグル */
  function toggleHighlight(task: Task) {
    const highlighted = !task.highlighted;
    run(() => setTaskHighlightAction(task.id, highlighted), {
      type: "highlight",
      id: task.id,
      highlighted,
    });
  }

  /**
   * Enter の打刻（画面定義書01 §6）。未実行=開始 / 実行中=終了 のトグル、
   * 完了=複製して開始（F-208 / O-14）。打刻時刻はクライアントの現在時刻を送る（§7）
   */
  function punch(task: Task) {
    const status = taskStatus(task);
    const now = new Date();
    if (status === "completed") {
      duplicateAndStart(task, now); // F-208 / O-14
    } else if (status === "not_started") {
      run(() => startTaskAction(task.id, now), { type: "start", id: task.id, at: now });
    } else {
      finish(task, now);
    }
  }

  /**
   * 終了打刻（実行中→完了）。完了したら選択行を次の未実行タスクへ送る（F-211 / §5）。送り先を
   * 決める `orderedTasks` は楽観的更新の適用前で終了対象がまだ実行中として残るため、実行中を優先する
   * `currentTaskId` だとその行を選び直してしまう。送り先がなければ打刻した行を選ぶ（§5。別の行を
   * 選んだまま打刻していてもそこへ送る＝拒否されたときの戻し先と同じ）。
   * サーバが拒んだら行の巻き戻しに合わせて選択も戻す（§5 / N-01。完了していない以上、選択だけ先へ送らない）
   */
  function finish(task: Task, now: Date) {
    const next = currentNotStartedId(orderedTasks, currentSectionId) ?? task.id;
    setSelectedId(next);

    run(
      () => finishTaskAction(task.id, now),
      { type: "finish", id: task.id, at: now },
      // 戻す先は打刻した行（行が実行中へ巻き戻る先と揃える）。送った選択がそのままのときだけ戻し、
      // 確定を待つ間にユーザーが選び直していたらその操作を優先する
      () => setSelectedId((current) => (current === next ? task.id : current))
    );
  }

  /**
   * 複製して開始（F-208 / O-14）。完了タスクの「もう一回」。生成物の採番はサーバが決めるため
   * 楽観的更新はせず（O-11 と同じ）、開始した複製タスクへ選択を移す
   */
  function duplicateAndStart(task: Task, now: Date) {
    runSelectingCreated(() => duplicateAndStartTaskAction(task.id, now));
  }

  /** 開始打刻の取り消し（O-13 / F-210）。実行中タスクを未実行へ戻す。now はクライアントのものを送る */
  function unstart(task: Task) {
    run(() => undoStartAction(task.id, new Date()), { type: "unstart", id: task.id });
  }

  /**
   * 完了の取り消し（O-15 / F-212）。完了タスクを未実行へ戻す。実績を破棄するので、
   * 復帰に要る4列のスナップショットを保留スロットへ置いて Undoトーストを出す。
   * 楽観的更新は打刻のクリアだけ（並べ直しはサーバ確定後。O-13 と同じ扱い）
   */
  function uncomplete(task: Task) {
    run(
      async () => {
        const result = await undoCompleteAction(task.id, new Date());
        if (result.ok) {
          holdUndo({ type: "uncomplete", name: task.name, snapshot: result.snapshot });
        }
        return result;
      },
      { type: "uncomplete", id: task.id }
    );
  }

  /**
   * 開始・終了時刻のインライン修正（F-203）。HH:MM の解釈は運用タイムゾーン固定（T-47）で、
   * どの暦日へ落とすかは日界（F-116）とタスクの論理日で決まる（画面定義書01 §3.3）。
   * 現在時刻は未来への修正を弾くために渡す（他の打刻と同じくクライアントのもの）
   */
  function editPunch(task: Task, field: "startedAt" | "endedAt", hhmm: string) {
    // 検証と送信で同じ現在時刻を使う（分をまたぐ瞬間に判定と保存で日が割れないように）
    const now = new Date();
    const context = { timeZone: APP_TIME_ZONE, dayStartMinutes, now };
    const edited =
      field === "startedAt"
        ? editStartedAt(task, hhmm, context)
        : editEndedAt(task, hhmm, context);
    if (!edited.ok) {
      setError(PUNCH_EDIT_MESSAGES[edited.error]);
      return;
    }

    // editStartedAt / editEndedAt を通った時点で startedAt は必ず存在する
    if (task.startedAt === null) return;
    const punch =
      field === "startedAt"
        ? { startedAt: edited.value, endedAt: task.endedAt }
        : { startedAt: task.startedAt, endedAt: edited.value };

    // 移動先セクションの判定に使う HH:MM は、運用タイムゾーンで整形して送る（§4.2-c）。
    // 「今日」の判定に使う現在時刻も、他の打刻と同じくクライアントのものを送る
    run(
      () => updateTaskPunchAction(task.id, punch, formatClock(punch.startedAt), new Date()),
      { type: "punch", id: task.id, ...punch }
    );
  }

  /** モード・プロジェクト・セクションの割り当て（O-5） */
  function assign(task: Task, field: "mode" | "project" | "section", id: number | null) {
    if (field === "mode") {
      run(() => setTaskModeAction(task.id, id), { type: "mode", id: task.id, modeId: id });
      return;
    }
    if (field === "project") {
      run(() => setTaskProjectAction(task.id, id), {
        type: "project",
        id: task.id,
        projectId: id,
      });
      return;
    }
    // セクション移動は移動先末尾への並び替え。表示上の位置はクライアントで決まるので楽観更新する
    const destination = optimisticGroups.find((g) => (g.section?.id ?? null) === id);
    run(() => setTaskSectionAction({ taskId: task.id, date, sectionId: id }), {
      type: "move",
      id: task.id,
      destination: { sectionId: id, index: destination?.tasks.length ?? 0 },
    });
  }

  /** 中断・複製・先送り・削除（F-204 / F-111 / F-107 / O-8） */
  function operate(task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") {
    if (operation === "delete") {
      run(
        async () => {
          const result = await deleteTaskAction(task.id);
          if (result.ok) {
            holdUndo({ type: "delete", name: result.deleted.name, task: result.deleted });
          }
          return result;
        },
        { type: "remove", id: task.id }
      );
      return;
    }

    if (operation === "duplicate") {
      // 複製したタスクを選択する（O-11）。採番はサーバが決めるため楽観更新はしない
      runSelectingCreated(() => duplicateTaskAction(task.id));
      return;
    }

    // 中断・先送りは楽観更新せずサーバ確定を待つ（＝ optimistic を渡さない）
    run(() =>
      operation === "suspend"
        ? suspendTaskAction(task.id, new Date())
        : postponeTaskAction(task.id)
    );
  }

  /**
   * ルーチン化（O-12 / §4.1）。デイリーの表示は変わらないので楽観的更新はせず、
   * サーバ確定を待って完了トーストを出す
   */
  function routinize(task: Task, choice: RoutineFromTaskChoice) {
    run(async () => {
      const result = await createRoutineFromTaskAction(task.id, choice);
      if (result.ok) setNotice(`「${task.name}」をルーチン化しました（明日から展開）`);
      return result;
    });
  }

  /**
   * 保留中の取り消しを実行する（削除 O-8 / 完了の取り消し O-15。保留は共通の1スロット。O-13）。
   * どちらも並びが戻るためサーバ確定を待つ（楽観的更新はしない）
   */
  function undoPending() {
    if (pendingUndo === null) return;
    const undoing = pendingUndo;
    setPendingUndo(null);
    run(() =>
      undoing.type === "delete"
        ? restoreTaskAction(undoing.task)
        : restoreCompletionAction(undoing.snapshot)
    );
  }

  /**
   * Shift+J/K での並び替え（画面定義書01 §6）。N-01 が0ms目標に挙げる操作なので楽観更新する。
   * 移動先はサーバ確定（moveTaskByStep）と同じ純関数 stepMoveDestination で求める（規則の二重実装を排除）
   */
  function moveByStep(step: 1 | -1) {
    if (selectedId === null) return;

    // 移動タスクへ選択を固定する（§5）。未選択（rawSelectedId=null）のままだと移動後に
    // keepSelection が選択を「現在地」（§5）へ再導出し、別タスクへ飛ぶ（FB-50）
    setSelectedId(selectedId);

    // 表示中のセクション順（アーカイブ済み含む）。サーバ確定は displaySectionOrder(sameDay, sections)
    // で同じ順を作る（画面定義書01 O-6）。ここは楽観更新後の並びを使うため optimisticGroups から採る
    const sectionOrder = optimisticGroups.map((g) => g.section?.id ?? null);
    const destination = stepMoveDestination(orderedTasks, selectedId, step, sectionOrder);
    if (destination === null) return; // 移動先なし（リスト全体の端など）

    run(() => moveTaskByStepAction({ taskId: selectedId, date, step }), {
      type: "move",
      id: selectedId,
      destination,
    });
  }

  // 組み立てはイベント時に行う（描画中に呼ぶと、`add` が読む仮タスクIDの連番＝ref を
  // 描画中に触りうる形になる。react-hooks/refs）
  function onQuickAddKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    inlineEditKeyHandler({
      // 追加できたときだけ欄からフォーカスを外し、追加行の操作へ移る（§3.4 / FB-29）
      onEnter: (input) => {
        if (name.trim() !== "") input.blur();
        add();
      },
      onEscape: (input) => input.blur(), // Esc でフォーカスを外しリスト操作へ戻る
    })(event);
  }

  // Undo トーストの自動消去（O-8）は Toast コンポーネント側に一元化してある（画面定義書00_共通 §2.2「消え方」/ FB-15）

  // グローバルキーボードショートカット（§6）
  useDailyShortcuts({
    editing,
    pickerOpen: showDatePicker,
    orderedTasks,
    selectedId,
    currentSectionId,
    hasPendingUndo: pendingUndo !== null,
    date,
    quickAddRef,
    router,
    setEditing,
    setShowHelp,
    setSelectedId,
    openDatePicker: () => setShowDatePicker(true),
    moveByStep,
    punch,
    operate,
    toggleHighlight,
    unstart,
    uncomplete,
    undoPending,
  });

  return (
    <>
      {/*
        画面上部（h1・日付ナビ＋サマリ・クイック追加欄）は画面上端に固定する（§2 / FB-22）。
        本文の余白（main の py-6）の中で固定すると隙間からリストが覗くので、
        負のマージンで余白ぶんまで背景を広げてから内側で戻す
      */}
      <div
        ref={stickyRef}
        // 下端の罫線でリストとの階層を示す（§2。罫線がないとスクロール中に境界が分からない）
        className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-line-strong bg-paper px-6 pt-6 pb-3"
      >
        {/* 画面見出し（画面定義書01 §2。S-02/S-03 と揃える） */}
        <h1 className="mb-3 text-lg font-bold">デイリー</h1>

        {/* 日付ナビ＋サマリ（画面定義書01 §2）。
            サマリは日付の直後へ左寄せで続ける（§3.1 / FB-22）。? だけ右端に置く */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DateNav
            date={date}
            weekday={weekdayIndex(date)}
            isToday={isToday}
            basePath="/"
            picker={{ today, open: showDatePicker, onOpenChange: setShowDatePicker }}
          />
          <DailySummary
            groups={optimisticGroups}
            now={now}
            isToday={isToday}
            dayStartMinutes={dayStartMinutes}
          />
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="キーボードショートカット"
            className="ml-auto text-xs text-ink-faint hover:text-ink"
          >
            ?
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <PlusIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <input
            ref={quickAddRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onQuickAddKeyDown}
            placeholder="タスク名を入力して Enter で追加"
            className={`w-full text-sm ${inputBase}`}
          />
        </div>
      </div>

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}

      {/* トースト置き場（画面定義書00_共通 §2.2「位置」）。Undo とエラーが同時に出ても重ならないよう1箇所にまとめる */}
      {(pendingUndo !== null || notice !== null || error !== null) && (
        <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
          {/* 取り消しの Undo トースト（削除 O-8 / 完了の取り消し O-15）。
              key（連番）で操作のたびに再マウントし、表示時間を毎回リセットする */}
          {pendingUndo !== null && (
            <Toast
              key={pendingUndo.seq}
              message={pendingUndoMessage(pendingUndo)}
              variant="undo"
              actionLabel="取り消す"
              onAction={undoPending}
              onClose={() => setPendingUndo(null)}
            />
          )}
          {/* 操作完了の通知（ルーチン化など） */}
          {notice !== null && (
            <Toast key={notice} message={notice} variant="info" onClose={() => setNotice(null)} />
          )}
          {/* 永続化失敗のエラートースト。key はメッセージ文字列でよい
              （同一メッセージの連続発生でタイマーが延長されなくても実害はないため） */}
          {error !== null && (
            <Toast key={error} message={error} variant="error" onClose={() => setError(null)} />
          )}
        </div>
      )}

      {staleRunningTask !== null && <StaleRunningBanner task={staleRunningTask} />}

      <DailyList
        groups={optimisticGroups}
        modes={modes}
        projects={projects}
        onRename={rename}
        onEstimate={setEstimate}
        onComment={setComment}
        onToggleHighlight={toggleHighlight}
        onPunch={punch}
        onEditPunch={editPunch}
        sections={sections}
        onAssign={assign}
        onOperate={operate}
        onRoutinize={routinize}
        editing={editing}
        onBeginEdit={(task, field) => setEditing({ taskId: task.id, field })}
        onEndEdit={() => setEditing(null)}
        selectedId={selectedId}
        onSelect={setSelectedId}
        now={now}
        isToday={isToday}
        dayStartMinutes={dayStartMinutes}
        currentSectionId={currentSectionId}
        stickyHeight={stickyHeight}
      />
    </>
  );
}
