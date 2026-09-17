import { describe, expect, it } from "vitest";
import { inMemorySectionRepository } from "./testing/in-memory-repository";
import type { Section } from "@/domain/section/section";
import { resolveToday, todayFromSections } from "./resolve-today";

// 日界セクション 朝 06:00（F-116）。日界より前の JST は前の暦日になる
const dayStartMorning: Section = {
  id: 1,
  name: "朝",
  startTime: "06:00",
  isArchived: false,
  isDayStart: true,
};
const forenoon: Section = { id: 2, name: "午前", startTime: "09:00", isArchived: false };

// JST 05:59 = UTC 前日 20:59 / JST 06:00 = UTC 前日 21:00
const jst0559 = new Date("2026-07-20T20:59:00Z");
const jst0600 = new Date("2026-07-20T21:00:00Z");

// 日付の導出そのもの（境界の入り・日界 0 の一致）は `domain/shared/logical-date.test.ts`、
// 日界セクションの既定 00:00 は `domain/section/section.test.ts` が持つ。ここで見るのは
// **セクションから日界を取り出して domain へ渡しているか**——日界を渡し忘れて 0 にする変異は
// 下位段のどのテストも落とさず、この1件だけが落ちる
describe("todayFromSections（F-116: 取得済みセクションから今日を解決）", () => {
  it("日界セクションの開始時刻を起点にする（06:00 なら JST 05:59 はまだ前の暦日）", () => {
    expect(todayFromSections([dayStartMorning, forenoon], jst0559)).toBe("2026-07-20");
  });
});

describe("resolveToday（F-116: リポジトリから今日を解決）", () => {
  it("リポジトリの日界セクションを踏まえて解決する", async () => {
    const repo = inMemorySectionRepository([dayStartMorning, forenoon]);
    expect(await resolveToday(repo, jst0559)).toBe("2026-07-20");
    expect(await resolveToday(repo, jst0600)).toBe("2026-07-21");
  });
});
