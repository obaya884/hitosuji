// 打刻・中断・複製が書き換える配置（どの行がどのセクションのどこへ入るか）の計画。
// サーバ（usecases）は計画をリポジトリへ書き、画面（楽観的更新）は同じ計画を表示へ当てる——
// 確定前の表示が確定結果と一致するのは、両者がこの同じ関数を呼ぶから（画面定義書01 §4 冒頭「線引きの基準」）。
// 挙動の契約は画面定義書01 §4.2・O-2 / O-4 / O-11 / O-13 / O-14 / O-15、採番は データモデル定義書 §4.2・§4.4〜同書 §4.7
import { sectionAt, type Section, type SectionId } from "../section/section";
import { duplicateDraft, type DuplicateDraft } from "./duplicate";
import { resumeTaskDraft, type ResumeTaskDraft } from "./punch";
import {
  relocationOnPunchEdit,
  relocationOnStart,
  relocationOnUndoPunch,
  startOrderIndex,
  withRelocations,
  type Relocation,
} from "./relocation";
import {
  placeNewBelow,
  placeNewPair,
  placeSortOrder,
  tasksInSection,
  type Renumber,
} from "./sort-order";
import type { Task, TaskId } from "./task";

/** 新しく作る1行の内容と置き場（日付は元タスクと同じなので持たない） */
export type NewRowPlan<D> = Readonly<{ draft: D; sectionId: SectionId | null; sortOrder: number }>;

/** 割り込み（データモデル定義書 §4.2-b）: 実行中タスクの終了と、その再開タスクの生成 */
export type InterruptionPlan = Readonly<{
  runningTaskId: TaskId;
  endedAt: Date;
  resume: NewRowPlan<ResumeTaskDraft>;
}>;

/** 開始を伴う計画（開始 O-2・複製して開始 O-14）の入力 */
export type StartPlanInput = Readonly<{
  target: Task;
  sameDay: readonly Task[];
  sections: readonly Section[];
  /** 日付をまたいで探した実行中タスク（前日以前でもよい）。終了できることは呼び出し側が確かめる */
  running: Task | null;
  now: Date;
  nowClock: string;
  isToday: boolean;
}>;

/**
 * 開始（O-2 / F-201）の計画。今日なら開始タスク自身を規則a で移し（画面定義書01 §4.2-a）、
 * 実行中タスクがあれば割り込みとして再開タスクを**移動後の**開始タスクの直下に置く。
 * 再開タスクの採番で中間値が尽きたときの振り直し（`renumber`）は割り込みの側に持つ（割り込みが無ければ生じない）
 */
export function planStart(input: StartPlanInput): Readonly<{
  relocations: Relocation[];
  interruption: (InterruptionPlan & Readonly<{ renumber: Renumber }>) | null;
}> {
  const { target, sameDay, running, now } = input;
  const relocations = input.isToday
    ? relocationOnStart(target, sameDay, input.sections, now, input.nowClock)
    : [];
  if (running === null) return { relocations, interruption: null };

  // 再開タスクは開始タスクの直下（＝開始タスクと同じ日付・セクション）。前日以前の実行中タスクを
  // 割り込んだ場合も当日側に生成される（データモデル定義書 §4.2）
  const afterMove = withRelocations(sameDay, relocations);
  const started = withRelocations([target], relocations)[0];
  const placed = placeNewBelow(afterMove, started);
  return {
    relocations,
    interruption: {
      runningTaskId: running.id,
      endedAt: now, // 終了と開始に同じ時刻を使い、実績に隙間を作らない
      resume: {
        draft: resumeTaskDraft(running, now),
        sectionId: started.sectionId,
        sortOrder: placed.sortOrder,
      },
      renumber: placed.renumber,
    },
  };
}

/** 中断（O-4 / F-204）の計画。再開タスクは元タスクの直後（データモデル定義書 §4.2-a） */
export function planSuspend(
  target: Task,
  sameDay: readonly Task[],
  now: Date
): Readonly<{ resume: NewRowPlan<ResumeTaskDraft>; renumber: Renumber }> {
  const placed = placeNewBelow(sameDay, target);
  return {
    resume: {
      draft: resumeTaskDraft(target, now),
      sectionId: target.sectionId,
      sortOrder: placed.sortOrder,
    },
    renumber: placed.renumber,
  };
}

/**
 * 複製（O-11 / F-111）の計画。未実行タスクとして**複製元の直下**へ置く。
 * 今日の表示で複製元が現在位置より前にあるときの繰り下げは規則b（`planCarryOver`）が後から当たる
 */
export function planDuplicate(
  target: Task,
  sameDay: readonly Task[]
): Readonly<{ duplicate: NewRowPlan<DuplicateDraft>; renumber: Renumber }> {
  const placed = placeNewBelow(sameDay, target);
  return {
    duplicate: {
      draft: duplicateDraft(target),
      sectionId: target.sectionId,
      sortOrder: placed.sortOrder,
    },
    renumber: placed.renumber,
  };
}

/**
 * 複製して開始（O-14 / F-208 / データモデル定義書 §4.6）の計画。複製行は開始済みで作るので、
 * 規則a と同じ「開始時刻順の位置」へ置く。セクションは今日なら現在時刻を含むセクション、
 * 今日でなければ（または現在時刻がどのセクションにも属さなければ）複製元と同じ。
 * 実行中タスクがあれば割り込みとして再開タスクを複製行の直下へ置き、2行の採番を一度に決める（データモデル定義書 §3.5 の例外）
 */
export function planDuplicateAndStart(input: StartPlanInput): Readonly<{
  duplicate: NewRowPlan<DuplicateDraft>;
  interruption: InterruptionPlan | null;
  renumber: Renumber;
}> {
  const { target, running, now } = input;
  const sectionId = input.isToday
    ? sectionAt(input.sections, input.nowClock)?.id ?? target.sectionId
    : target.sectionId;
  const siblings = tasksInSection(input.sameDay, sectionId);
  const index = startOrderIndex(siblings, now);
  const draft = duplicateDraft(target);

  if (running === null) {
    const single = placeSortOrder(siblings, index);
    return {
      duplicate: { draft, sectionId, sortOrder: single.sortOrder },
      interruption: null,
      renumber: single.renumber,
    };
  }

  const pair = placeNewPair(siblings, index);
  return {
    duplicate: { draft, sectionId, sortOrder: pair.first },
    interruption: {
      runningTaskId: running.id,
      endedAt: now,
      resume: { draft: resumeTaskDraft(running, now), sectionId, sortOrder: pair.second },
    },
    renumber: pair.renumber,
  };
}

/**
 * 打刻の取り消し（開始 O-13 / データモデル定義書 §4.5、完了 O-15 / 同書 §4.7）に伴う並べ直し。
 * 今日のタスクだけ未実行として「現在位置」へ置き直す（今日以外は現在位置が定義できない）
 */
export function planUndoPunch(
  target: Task,
  sameDay: readonly Task[],
  sections: readonly Section[],
  nowClock: string,
  isToday: boolean
): Relocation[] {
  return isToday ? relocationOnUndoPunch(target, sameDay, sections, nowClock) : [];
}

/**
 * 打刻時刻の修正（F-203）に伴う並べ直し（画面定義書01 §4.2-c）。開始時刻が変わったときだけ移し、
 * 終了時刻だけの修正では動かさない（帰属は「いつ始めたか」で決める）。表示日は問わない
 */
export function planPunchEdit(
  target: Task,
  sameDay: readonly Task[],
  sections: readonly Section[],
  startedAt: Date,
  startClock: string
): Relocation[] {
  const startedAtChanged = target.startedAt?.getTime() !== startedAt.getTime();
  return startedAtChanged
    ? relocationOnPunchEdit(target, sameDay, sections, startedAt, startClock)
    : [];
}
