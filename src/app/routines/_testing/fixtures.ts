// ルーチン管理（S-02）のコンポーネントテスト用データ。
// routines-table / routine-form の両テストが同じ雛形を使う（重複を1本に寄せる）
import { MODE_COLORS, type Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Routine } from "@/domain/routine/routine";
import type { Section } from "@/domain/section/section";

/** フォームの「開始日」の既定値になる表示日 */
export const TODAY = "2026-07-26";

export const MODES: readonly Mode[] = [
  { id: 1, name: "モードA", color: MODE_COLORS[0], isArchived: false },
  { id: 2, name: "モードB", color: MODE_COLORS[1], isArchived: false },
];

export const PROJECTS: readonly Project[] = [
  { id: 11, name: "案件A", isArchived: false },
  { id: 12, name: "案件B", isArchived: false },
];

export const SECTIONS: readonly Section[] = [
  { id: 1, name: "朝", startTime: "05:00", isArchived: false, isDayStart: true },
  { id: 2, name: "午前", startTime: "09:00", isArchived: false },
  { id: 3, name: "午後", startTime: "13:00", isArchived: false },
];

/** 既定は「毎日・09:00・30分・モード/プロジェクト未設定・有効」。各テストは差分だけを渡す */
export function routine(over: Partial<Routine> & { id: number }): Routine {
  return {
    name: `ルーチン${over.id}`,
    estimateMinutes: 30,
    scheduledStartTime: "09:00",
    modeId: null,
    projectId: null,
    recurrenceType: "daily",
    weekdays: null,
    weekInterval: null,
    monthDay: null,
    intervalDays: null,
    startDate: "2026-07-01",
    endDate: null,
    isActive: true,
    ...over,
  };
}
