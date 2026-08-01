// 終了予定時刻と残時間（F-104）・予想開始時刻（F-120 / データモデル定義書 §4.3）
// DBには保存しない導出値。現在時刻とタイムゾーンは引数で受け取る（domain は now も環境も持たない）
import { offsetFromDayStart, startMinutes, type SectionId } from "../section/section";
import { todayLogicalDate } from "../shared/logical-date";
import { fromZonedClock } from "../shared/time-zone";
import type { DailyGroup } from "./daily-list";
import { taskStatus } from "./status";
import { elapsedMinutes, type Task, type TaskId } from "./task";

/**
 * 現在時刻が属する論理日の暦日 0:00（F-116）。日界（分）より前の時間帯は前の暦日が起点になる。
 * 折返し表記・超過警告・セクション終了時刻を、暦日 0:00 ではなく論理日の区切りで測るための基準。
 * 暦日と壁時計は運用タイムゾーンで読む（表示の `formatClock` と同じ基準。T-47）。
 * 論理日そのものの決定は `todayLogicalDate` に任せ（日界の規則を2か所に持たない）、
 * その暦日 0:00 を運用タイムゾーンの壁時計として絶対時刻に戻す。
 * 既定（dayStartMinutes = 0）では now の暦日 0:00 に一致する。
 */
function logicalBaseMidnight(now: Date, timeZone: string, dayStartMinutes: number): Date {
  const [year, month, day] = todayLogicalDate(now, timeZone, dayStartMinutes)
    .split("-")
    .map(Number);
  return fromZonedClock({ year, month, day, hours: 0, minutes: 0 }, timeZone);
}

/**
 * 1タスクぶんの未完了見積もり（分）。完了は0、実行中は残り、未実行は見積もりそのまま。
 * 見積もり未設定（0分）は0として積まれる＝計算に含まれない（画面定義書01 §3.3）。
 * これの総和が `remainingMinutes`（データモデル定義書 §4.3 の「未完了見積もり」）
 */
function unfinishedMinutesOf(task: Task, now: Date): number {
  const status = taskStatus(task);
  if (status === "completed") return 0;

  if (status === "running") {
    const elapsed = elapsedMinutes(task, now) ?? 0;
    // 見積もりを超過していても残りは0（マイナスにしない）
    return Math.max(task.estimateMinutes - elapsed, 0);
  }
  return task.estimateMinutes;
}

/**
 * 残時間（分）= 実行中タスクの残り + 未実行タスクの見積もり合計。
 * 見積もり未設定（0分）は計算に含まれない（画面定義書01 §3.3）
 */
export function remainingMinutes(tasks: readonly Task[], now: Date): number {
  return tasks.reduce((sum, task) => sum + unfinishedMinutesOf(task, now), 0);
}

/** 終了予定時刻（F-104）= 現在時刻 + 残時間 */
export function projectedEndTime(tasks: readonly Task[], now: Date): Date {
  return new Date(now.getTime() + remainingMinutes(tasks, now) * 60_000);
}

/**
 * 未実行タスクの予想開始時刻（F-120 / データモデル定義書 §4.3）。終了予定時刻（F-104）と同じ
 * 積み上げの途中経過で、`now + 実行中タスクの残り + それより前にある未実行タスクの見積もり合計`。
 * `tasks` は表示順（画面定義書01 §3.2 の回転順 → sort_order）で渡す。実行中タスクの残りは
 * 積み上げの起点に常に含める（未実行行が実行中タスクより上にあっても引かない）ため、
 * 最後の未実行タスクの予想開始 + その見積もり = 終了予定時刻 が保たれる。
 * セクションをまたいでもリセットしない。戻り値は未実行タスクのみを持つ（実行中・完了は実打刻を持つ）
 */
export function projectedStartTimes(tasks: readonly Task[], now: Date): Map<TaskId, Date> {
  let offset = tasks
    .filter((task) => taskStatus(task) === "running")
    .reduce((sum, task) => sum + unfinishedMinutesOf(task, now), 0);

  const startTimes = new Map<TaskId, Date>();
  for (const task of tasks) {
    if (taskStatus(task) !== "not_started") continue;
    startTimes.set(task.id, new Date(now.getTime() + offset * 60_000));
    offset += task.estimateMinutes; // 未設定（0分）は0として積む（§4.3）
  }
  return startTimes;
}

/**
 * 論理日の暦日 0:00 を起点に測った時計数字（日界 F-116 を踏まえる。データモデル定義書 §4.3）。
 * 24:00 を超えると hours は 25, 26… と伸びる（折返し表記 `25:30` の材料）。
 * 既定（dayStartMinutes = 0）では now の暦日 0:00 起点。
 * 基準は運用タイムゾーン（実打刻の `formatClock` と同じ。T-47）
 */
function logicalClock(
  at: Date,
  now: Date,
  timeZone: string,
  dayStartMinutes: number
): { hours: number; minutes: number } {
  const startOfBase = logicalBaseMidnight(now, timeZone, dayStartMinutes);
  const minutesFromBase = Math.floor((at.getTime() - startOfBase.getTime()) / 60_000);
  return {
    hours: Math.floor(minutesFromBase / 60),
    minutes: ((minutesFromBase % 60) + 60) % 60,
  };
}

/**
 * 終了予定時刻の表示（F-104: 24:00超過は翌日表記 `25:30`）。
 * 折返しの時計数字は論理日の暦日 0:00 起点（日界 F-116 を踏まえる。データモデル定義書 §4.3）。
 * 既定（dayStartMinutes = 0）では now の暦日 0:00 起点で従来どおり。
 */
export function formatProjectedEnd(
  end: Date,
  now: Date,
  timeZone: string,
  dayStartMinutes = 0
): string {
  const { hours, minutes } = logicalClock(end, now, timeZone, dayStartMinutes);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/**
 * 予想開始時刻の表示（F-120 / 画面定義書01 §3.3 の `HH:MM-` 形式）。返す文字列は `09:05–`。
 * 実打刻（`09:35–`）と同じ列に並ぶので、時は2桁ゼロ埋め・区切りも実打刻と同じ en dash に揃える。
 * 24:00 超過は終了予定と同じ論理日基準の折返し表記（`25:30–`）
 */
export function formatProjectedStart(
  start: Date,
  now: Date,
  timeZone: string,
  dayStartMinutes = 0
): string {
  const { hours, minutes } = logicalClock(start, now, timeZone, dayStartMinutes);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}–`;
}

/**
 * 終了予定が論理日の区切り（次の日界）を越えるか（F-104: 警告色の判定に使う）。
 * 既定（dayStartMinutes = 0）では暦日 24:00 超過に一致する（データモデル定義書 §4.3）。
 */
export function isOverMidnight(
  end: Date,
  now: Date,
  timeZone: string,
  dayStartMinutes = 0
): boolean {
  const base = logicalBaseMidnight(now, timeZone, dayStartMinutes);
  const nextDayStart = base.getTime() + (24 * 60 + dayStartMinutes) * 60_000;
  return end.getTime() >= nextDayStart;
}

/**
 * セクション開始の絶対時刻。枠の起点（日界からの巡回位置。F-116）を論理日の区切りから測るので、
 * 日界を跨ぐ枠（回転で末尾に来る深夜など）も同じ論理日の中で正しく置ける。
 * 既定（dayStartMinutes = 0）では now の暦日で解釈する従来挙動に一致する。
 */
function sectionStartAt(
  now: Date,
  startTime: string,
  timeZone: string,
  dayStartMinutes: number
): Date {
  const base = logicalBaseMidnight(now, timeZone, dayStartMinutes);
  const startOffset = offsetFromDayStart(startMinutes(startTime), dayStartMinutes);
  return new Date(base.getTime() + (dayStartMinutes + startOffset) * 60_000);
}

/** 開始の絶対時刻に枠の長さ（`sectionCapacityMinutes`）を足して枠の終了を作る */
function sectionEndFrom(startAt: Date, startTime: string, endTime: string): Date {
  return new Date(startAt.getTime() + sectionCapacityMinutes(startTime, endTime) * 60_000);
}

/**
 * セクションの枠の終了時刻と、そこまでの余裕（分）。マイナスは枠に収まらないこと。
 * 語は `slack` で通す——同じファイルの `remainingMinutes`（F-104 の未完了見積もりの合計）と
 * 紛れないため。表示語「残り」への変換は見出し（`GroupHeading`）の prop 名だけで行う
 */
export type SectionSlack = Readonly<{ endAt: Date; slackMinutes: number }>;

/**
 * セクションごとの残り時間（分, F-110 / データモデル定義書 §4.3）。
 * **セクションごとに独立**して、自分の枠と自分に配置されたタスクだけで決まる:
 * `枠の終了 − max(now, 枠の頭) − そのセクションの未完了見積もり`。
 * 他のセクションのやり残しは持ち込まない（見出しの数字を単独で読めるようにするため。FB-81）。
 *
 * `max` を取る（まだ始まっていないセクションは now ではなく枠の頭から測る）のが
 * 終了予定時刻（F-104）・予想開始時刻（F-120）との違い——両者は「詰めてやったらいつ終わるか」を、
 * F-110 は「この枠に収まるか」を答えるため。これがないと残りが枠の長さを超える（FB-80）。
 *
 * 枠が定まらないグループ（未分類・アーカイブ済みセクション）は戻り値に含めない。
 * この値は表示日=今日のときだけ出す（画面定義書01 §3.2）ため、now の暦日 = 表示日となる。
 * 各セクションが独立して決まるので**`groups` の順序には依存しない**（表示順で渡さなくてよい）。
 * 表示可否（表示日=今日・now < 枠の終了）は `endAt` を見て呼び出し側が判定する（画面定義書01 §3.2）
 */
export function sectionSlacks(
  groups: readonly DailyGroup[],
  now: Date,
  timeZone: string,
  dayStartMinutes = 0
): Map<SectionId, SectionSlack> {
  const slacks = new Map<SectionId, SectionSlack>();

  for (const group of groups) {
    if (group.section === null || group.endTime === null) continue; // 枠を持たない

    const startAt = sectionStartAt(now, group.section.startTime, timeZone, dayStartMinutes);
    const endAt = sectionEndFrom(startAt, group.section.startTime, group.endTime);
    // 枠がまだ始まっていなければ枠の頭から、始まっていれば now から測る
    const worksFrom = Math.max(now.getTime(), startAt.getTime());
    const worksUntil = worksFrom + remainingMinutes(group.tasks, now) * 60_000;

    slacks.set(group.section.id, {
      endAt,
      slackMinutes: Math.floor((endAt.getTime() - worksUntil) / 60_000), // 枠の終わり − 作業の終わり
    });
  }

  return slacks;
}

/**
 * セクション枠の長さ（分）。開始時刻から終了時刻まで（日をまたぐ場合は24時間を足す）。
 * F-110 の「合計 2:30/3:00」の分母
 */
export function sectionCapacityMinutes(startTime: string, endTime: string): number {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const span = end - start;
  return span > 0 ? span : span + 24 * 60;
}
