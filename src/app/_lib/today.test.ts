import { describe, expect, it } from "vitest";
import { inMemorySectionRepository } from "@/usecases/section/testing/in-memory-repository";
import type { Section } from "@/domain/section/section";
import { resolveToday, todayFromSections } from "./today";

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

describe("todayFromSections（F-116: 取得済みセクションから今日を解決）", () => {
  it("日界 06:00 で JST 05:59 はまだ前の暦日", () => {
    expect(todayFromSections([dayStartMorning, forenoon], jst0559)).toBe("2026-07-20");
  });

  it("日界 06:00 ちょうどはその暦日の今日", () => {
    expect(todayFromSections([dayStartMorning, forenoon], jst0600)).toBe("2026-07-21");
  });

  it("日界セクションが無ければ暦日と一致する（既定 00:00 のフォールバック）", () => {
    expect(todayFromSections([forenoon], jst0559)).toBe("2026-07-21");
  });
});

describe("resolveToday（F-116: リポジトリから今日を解決）", () => {
  it("リポジトリの日界セクションを踏まえて解決する", async () => {
    const repo = inMemorySectionRepository([dayStartMorning, forenoon]);
    expect(await resolveToday(repo, jst0559)).toBe("2026-07-20");
    expect(await resolveToday(repo, jst0600)).toBe("2026-07-21");
  });
});
