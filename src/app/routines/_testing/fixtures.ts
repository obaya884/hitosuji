// ルーチン管理（S-02）のコンポーネントテスト用データ。
// routines-table / routine-form の両テストが同じ雛形を使う（重複を1本に寄せる）。
// Routine そのものの雛形は全層共通の `@/domain/routine/testing/routine`（T-43）。
import { MODE_COLOR_PRESETS, type Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Section } from "@/domain/section/section";
import { TEST_DATE } from "@/domain/shared/testing/clock";

/** フォームの「開始日」の既定値になる表示日 */
export const TODAY = TEST_DATE;

export const MODES: readonly Mode[] = [
  { id: 1, name: "モードA", color: MODE_COLOR_PRESETS[0].value, isArchived: false },
  { id: 2, name: "モードB", color: MODE_COLOR_PRESETS[1].value, isArchived: false },
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
