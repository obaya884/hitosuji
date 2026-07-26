// 日界（F-116）を踏まえた「今日」の解決。
// 日付の導出そのものは domain（`todayLogicalDate`）が持ち、ここは日界セクションを
// リポジトリから読む合成と、運用タイムゾーンを domain へ与える役に徹する（T-47 / T-55）
import { dayStartTimeOf, startMinutes, type Section } from "@/domain/section/section";
import { todayLogicalDate, type LogicalDate } from "@/domain/shared/logical-date";
import { APP_TIME_ZONE } from "@/domain/shared/time-zone";
import type { SectionRepository } from "@/usecases/ports/section-repository";

/**
 * 取得済みのセクション配列から「今日」（論理日付）を日界を踏まえて解決する。
 * すでにセクションを読んでいる画面（二重 fetch を避けたい場所）で使う。
 */
export function todayFromSections(sections: readonly Section[], now: Date): LogicalDate {
  return todayLogicalDate(now, startMinutes(dayStartTimeOf(sections)), APP_TIME_ZONE);
}

/**
 * セクションリポジトリから「今日」を解決する。
 * 表示日判定・ルーチン展開対象日・繰り下げ・打刻の当日判定の起点に使う。
 */
export async function resolveToday(
  sections: SectionRepository,
  now: Date
): Promise<LogicalDate> {
  return todayFromSections(await sections.listAll(), now);
}
