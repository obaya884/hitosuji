// セクション集約（データモデル定義書 §3.1 / 画面定義書03 §3.1）
// 終了時刻・並び順はカラムに持たず start_time から導出する
import { validateName, type NameError } from "../shared/master-name";
import { err, ok, type Result } from "../shared/result";

export type SectionId = number;

export type Section = Readonly<{
  id: SectionId;
  name: string;
  startTime: string; // "HH:MM"
  isArchived: boolean;
  // 日界セクション（1日の開始。F-116）。省略時は非日界として扱う（フォールバックは "00:00"＝現状踏襲）
  isDayStart?: boolean;
}>;

/** 一覧表示用の枠。endTime は次セクションの開始時刻（最後のセクションは先頭へ折り返す） */
export type SectionRange = Readonly<{
  section: Section;
  endTime: string;
}>;

export type SectionError =
  | NameError
  | "invalid_start_time"
  | "duplicate_start_time"
  | "last_active_section"
  | "day_start_section";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** DB の time 型（"HH:MM:SS"）と入力値（"HH:MM"）の差を吸収する */
export function normalizeStartTime(raw: string): string {
  return raw.slice(0, 5);
}

/** "HH:MM" を0時からの分に変換する */
export function startMinutes(time: string): number {
  const [h, m] = normalizeStartTime(time).split(":").map(Number);
  return h * 60 + m;
}

export function isValidStartTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** start_time 昇順。手動の並び替えは提供しない（画面定義書03 §3.1） */
export function sortByStartTime(sections: readonly Section[]): Section[] {
  return [...sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function activeSections(sections: readonly Section[]): Section[] {
  return sortByStartTime(sections.filter((s) => !s.isArchived));
}

/** 日界セクションの開始時刻（F-116）。指定がなければ "00:00"（現状の 0:00 固定を踏襲するフォールバック） */
export function dayStartTimeOf(sections: readonly Section[]): string {
  const dayStart = activeSections(sections).find((s) => s.isDayStart);
  return dayStart ? dayStart.startTime : "00:00";
}

/** 日界からの巡回オフセット（分）。`(start_time − 日界 + 24h) % 24h`。回転の並び順の基準（F-116） */
export function dayStartOffset(startTime: string, dayStartTime: string): number {
  return (startMinutes(startTime) - startMinutes(dayStartTime) + 1440) % 1440;
}

/**
 * 日界セクションを先頭にした巡回順で有効セクションを並べる（F-116 / データモデル定義書 §3.1）。
 * 並びは `(start_time − 日界 + 24h) % 24h` 昇順。日界が 00:00（既定）なら start_time 昇順と一致する。
 * これは表示順の回転のみで、sectionRanges（枠の終了時刻）は巡回不変のため影響しない。
 */
export function rotateFromDayStart(sections: readonly Section[], dayStartTime?: string): Section[] {
  const anchor = dayStartTime ?? dayStartTimeOf(sections);
  return [...activeSections(sections)].sort(
    (a, b) => dayStartOffset(a.startTime, anchor) - dayStartOffset(b.startTime, anchor)
  );
}

/**
 * 有効セクションは24時間を隙間・重複なく敷き詰める（データモデル定義書 §3.1）ため、
 * 各枠の終了時刻は次の開始時刻、最後の枠の終了時刻は先頭の開始時刻になる。
 */
export function sectionRanges(sections: readonly Section[]): SectionRange[] {
  const actives = activeSections(sections);
  return actives.map((section, i) => ({
    section,
    endTime: actives[(i + 1) % actives.length].startTime,
  }));
}

/**
 * 指定時刻 "HH:MM" を含む有効セクションを求める（ルーチン展開のセクション導出。F-302）。
 * 有効セクションは24時間を敷き詰めるため必ず一意に定まる（データモデル定義書 §3.1）。
 * 先頭セクションの開始より前の時刻は、日をまたいで続く最後のセクションに属する
 */
export function sectionAt(sections: readonly Section[], time: string): Section | undefined {
  const actives = activeSections(sections);
  if (actives.length === 0) return undefined;

  const target = normalizeStartTime(time);
  const started = actives.filter((s) => s.startTime <= target);

  return started.length === 0 ? actives[actives.length - 1] : started[started.length - 1];
}

/**
 * 追加・編集時の検証（画面定義書03 §3.1）。
 * 有効セクション間の start_time 重複はエラー。自分自身との重複は除外する。
 */
export function validateSectionInput(
  input: Readonly<{ name: string; startTime: string }>,
  existing: readonly Section[],
  selfId?: SectionId
): Result<{ name: string; startTime: string }, SectionError> {
  const name = validateName(input.name);
  if (!name.ok) return name;

  const startTime = normalizeStartTime(input.startTime);
  if (!isValidStartTime(startTime)) return err("invalid_start_time");

  const duplicated = activeSections(existing).some(
    (s) => s.id !== selfId && s.startTime === startTime
  );
  if (duplicated) return err("duplicate_start_time");

  return ok({ name: name.value, startTime });
}

/**
 * アーカイブ可否（画面定義書03 §3.1）。
 * - 有効なセクションは最低1件必要（全件アーカイブ不可）
 * - 日界セクションはアーカイブ不可（先に別の有効セクションを日界に指定する。F-116）
 */
export function canArchive(
  sections: readonly Section[],
  targetId: SectionId
): Result<SectionId, SectionError> {
  const target = sections.find((s) => s.id === targetId);
  if (target?.isDayStart) return err("day_start_section");

  const remaining = activeSections(sections).filter((s) => s.id !== targetId);
  if (remaining.length === 0) return err("last_active_section");
  return ok(targetId);
}
