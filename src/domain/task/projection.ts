// 終了予定時刻と残時間（F-104）・予想開始時刻（F-120 / データモデル定義書 §4.3）
// DBには保存しない導出値。現在時刻とタイムゾーンは引数で受け取る（domain は now も環境も持たない）
import {
  offsetFromDayStart,
  sectionCapacityMinutes,
  startMinutes,
  type SectionId,
} from "../section/section";
import { todayLogicalDate } from "../shared/logical-date";
import { fromZonedClock } from "../shared/time-zone";
import type { DailyGroup } from "./daily-list";
import { taskStatus } from "./status";
import { elapsedMinutes, type Task, type TaskId } from "./task";

/**
 * 現在時刻が属する論理日の暦日 0:00（F-116）。日界（分）より前の時間帯は前の暦日が起点になる。
 * 日またぎ判定・超過警告・セクション終了時刻を、暦日 0:00 ではなく論理日の区切りで測るための基準。
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
    offset += task.estimateMinutes; // 未設定（0分）は0として積む（データモデル定義書 §4.3）
  }
  return startTimes;
}

/**
 * 論理日の暦日 0:00（`logicalBaseMidnight`）を起点に測った経過（日界 F-116。データモデル定義書 §4.3）。
 * `dayOffset` は**その起点暦日から何日先か**（0 = 同じ暦日）、`hours`/`minutes` は暦日の壁時計（0〜23時）。
 * 起点は now の暦日とは限らない——日界 06:00・now 07-26 02:00 なら論理日は 07-25 なので、
 * 同じ 07-26 の 05:00 でも `dayOffset` は 1 になる。既定（dayStartMinutes = 0）では now の暦日 0:00 起点。
 * 基準は運用タイムゾーン（実打刻の `formatClock` と同じ。T-47）。
 * 1日 = 24時間として割る（夏時間のあるゾーンでは暦日と1日ずれうるが、運用タイムゾーンの
 * Asia/Tokyo に夏時間が無いので成り立つ前提。`shared/time-zone.ts` の冒頭と同じ）
 */
function logicalClock(
  at: Date,
  now: Date,
  timeZone: string,
  dayStartMinutes: number
): { dayOffset: number; hours: number; minutes: number } {
  const startOfBase = logicalBaseMidnight(now, timeZone, dayStartMinutes);
  const minutesFromBase = Math.floor((at.getTime() - startOfBase.getTime()) / 60_000);
  // 床除算で日を切り出してから残りを取るので、剰余の符号を気にせず 0〜1439 に収まる
  const dayOffset = Math.floor(minutesFromBase / (24 * 60));
  const minutesInDay = minutesFromBase - dayOffset * 24 * 60;
  return { dayOffset, hours: Math.floor(minutesInDay / 60), minutes: minutesInDay % 60 };
}

/**
 * 暦日をまたいだ側であることを示す前置き（画面定義書01 §3.1「日またぎの時刻表記」）。
 * **区切りの空白を含めて返す**（またがないときは空文字）ので、呼び出し側は時刻の直前に連結するだけでよい。
 * 1日先は「翌」、2日以上先は「+N日」（見積もりが積み上がって当日中に終わらないとき。
 * 「翌」のままでは表示が嘘になる）。
 * `dayOffset` が負（起点より前）になる呼び出しは無い——`end`・`start` はいずれも now 以降で、
 * 起点は now の属する論理日の暦日 0:00 だから。万一渡っても前置なしに落ちる
 */
function dayPrefix(dayOffset: number): string {
  if (dayOffset <= 0) return "";
  return dayOffset === 1 ? "翌 " : `+${dayOffset}日 `;
}

/**
 * 終了予定時刻の表示（F-104 / 画面定義書01 §3.1）。時計の数字は暦日の壁時計のままとし、
 * 暦日をまたぐ側だけ「翌」を前置する（`翌 2:00`。折返し表記 `26:00` は使わない。FB-84）。
 * またいだかの判定は論理日の暦日 0:00 起点（日界 F-116 を踏まえる。データモデル定義書 §4.3）で、
 * 既定（dayStartMinutes = 0）では now の暦日 0:00 が起点になる。
 * **警告色の判定（`isOverMidnight`）とは独立**——あちらは次の日界を越えるかを見る
 */
export function formatProjectedEnd(
  end: Date,
  now: Date,
  timeZone: string,
  dayStartMinutes = 0
): string {
  const { dayOffset, hours, minutes } = logicalClock(end, now, timeZone, dayStartMinutes);
  return `${dayPrefix(dayOffset)}${hours}:${String(minutes).padStart(2, "0")}`;
}

/**
 * 予想開始時刻の表示（F-120 / 画面定義書01 §3.3 の `HH:MM-` 形式）。返す文字列は `09:05–`。
 * 実打刻（`09:35–`）と同じ列に並ぶので、時は2桁ゼロ埋め・区切りも実打刻と同じ en dash に揃える。
 * 暦日をまたぐ側は終了予定と同じ前置き（`翌 02:00–`。§3.1「日またぎの時刻表記」）
 */
export function formatProjectedStart(
  start: Date,
  now: Date,
  timeZone: string,
  dayStartMinutes = 0
): string {
  const { dayOffset, hours, minutes } = logicalClock(start, now, timeZone, dayStartMinutes);
  return `${dayPrefix(dayOffset)}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}–`;
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
 * 既定（dayStartMinutes = 0）では now の暦日で解釈する。
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
