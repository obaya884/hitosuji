// 日界（F-116）を踏まえた「今日」の解決。
// タイムゾーン抽出（format）は presentation、日界セクションは repo 経由で得るため、
// 両者を束ねるこの合成は presentation 層に置く（domain/usecase は now を持たない）。
import { dayStartTimeOf, type Section } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import { todayLogicalDate } from "./format";

/**
 * 取得済みのセクション配列から「今日」（論理日付）を日界を踏まえて解決する。
 * すでにセクションを読んでいる画面（二重 fetch を避けたい場所）で使う。
 */
export function todayFromSections(
  sections: readonly Section[],
  now: Date = new Date()
): LogicalDate {
  return todayLogicalDate(now, dayStartTimeOf(sections));
}

/**
 * セクションリポジトリから「今日」を解決する。
 * 表示日判定・ルーチン展開対象日・繰り下げ・打刻の当日判定の起点に使う。
 */
export async function resolveToday(
  sections: SectionRepository,
  now: Date = new Date()
): Promise<LogicalDate> {
  return todayFromSections(await sections.listAll(), now);
}
