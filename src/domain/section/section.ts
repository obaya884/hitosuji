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
}>;

/** 一覧表示用の枠。endTime は次セクションの開始時刻（最後のセクションは先頭へ折り返す） */
export type SectionRange = Readonly<{
  section: Section;
  endTime: string;
}>;

export type SectionError = NameError | "invalid_start_time" | "duplicate_start_time" | "last_active_section";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** DB の time 型（"HH:MM:SS"）と入力値（"HH:MM"）の差を吸収する */
export function normalizeStartTime(raw: string): string {
  return raw.slice(0, 5);
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

/** 有効なセクションは最低1件必要（全件アーカイブ不可。画面定義書03 §3.1） */
export function canArchive(
  sections: readonly Section[],
  targetId: SectionId
): Result<SectionId, SectionError> {
  const remaining = activeSections(sections).filter((s) => s.id !== targetId);
  if (remaining.length === 0) return err("last_active_section");
  return ok(targetId);
}
