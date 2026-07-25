import { describe, expect, it } from "vitest";
import {
  activeSections,
  byDayStartOrder,
  canArchive,
  currentSectionId,
  dayStartOffset,
  dayStartTimeOf,
  sectionAt,
  sectionRanges,
  validateSectionInput,
  type Section,
} from "./section";

function section(over: Partial<Section> & { id: number; startTime: string }): Section {
  return { name: `S${over.id}`, isArchived: false, ...over };
}

const morning = section({ id: 1, name: "朝", startTime: "06:00" });
const forenoon = section({ id: 2, name: "午前", startTime: "09:00" });
const midnight = section({ id: 3, name: "深夜", startTime: "00:00" });

describe("sectionRanges（画面定義書03 §3.1: 終了時刻は次セクションの開始から導出）", () => {
  it("各枠の終了時刻が次のセクションの開始時刻になる", () => {
    const ranges = sectionRanges([forenoon, midnight, morning]);
    expect(ranges.map((r) => [r.section.name, r.section.startTime, r.endTime])).toEqual([
      ["深夜", "00:00", "06:00"],
      ["朝", "06:00", "09:00"],
      ["午前", "09:00", "00:00"],
    ]);
  });

  it("最後のセクションは先頭の開始時刻へ折り返す（24時間を敷き詰める）", () => {
    const ranges = sectionRanges([morning, forenoon]);
    expect(ranges.at(-1)).toEqual({ section: forenoon, endTime: "06:00" });
  });

  it("有効セクションが1件なら終了時刻は自身の開始時刻（丸1日）", () => {
    expect(sectionRanges([morning])).toEqual([{ section: morning, endTime: "06:00" }]);
  });

  it("アーカイブ済みセクションは枠の導出に含めない", () => {
    const archived = section({ id: 4, startTime: "12:00", isArchived: true });
    expect(sectionRanges([morning, forenoon, archived]).map((r) => r.section.id)).toEqual([1, 2]);
  });
});

describe("sectionAt（F-302: 開始想定時刻を含むセクションの導出）", () => {
  const sections = [midnight, morning, forenoon]; // 00:00 / 06:00 / 09:00

  it("時刻を含むセクションを返す", () => {
    expect(sectionAt(sections, "06:30")?.name).toBe("朝");
    expect(sectionAt(sections, "12:00")?.name).toBe("午前"); // 09:00 以降は午前が続く
  });

  it("セクションの開始時刻ちょうどはそのセクションに属する", () => {
    expect(sectionAt(sections, "06:00")?.name).toBe("朝");
  });

  it("先頭セクションの開始より前の時刻は、日をまたいで続く最後のセクションに属する", () => {
    const withoutMidnight = [morning, forenoon]; // 06:00 / 09:00
    expect(sectionAt(withoutMidnight, "03:00")?.name).toBe("午前");
  });

  it("アーカイブ済みセクションは導出対象にしない", () => {
    const archived = section({ id: 9, name: "旧", startTime: "07:00", isArchived: true });
    expect(sectionAt([...sections, archived], "07:30")?.name).toBe("朝");
  });

  it("有効セクションが1件もなければ導出できない", () => {
    expect(sectionAt([], "06:30")).toBeUndefined();
  });

  it("配列は空でなくても全件アーカイブ済みなら導出できない", () => {
    const archived = section({ id: 9, name: "旧", startTime: "07:00", isArchived: true });
    expect(sectionAt([archived], "07:30")).toBeUndefined();
  });

  it("日界セクション（isDayStart）でも判定は時刻の包含だけで、日界の指定に左右されない（F-116）", () => {
    const dayStartAtMorning = section({ ...morning, isDayStart: true });
    expect(sectionAt([dayStartAtMorning, forenoon], "06:00")?.name).toBe("朝");
    expect(sectionAt([dayStartAtMorning, forenoon], "03:00")?.name).toBe("午前"); // 回転順ではなく時刻の包含のみで決まる
  });
});

describe("currentSectionId（画面定義書01 §3.2 現在セクションの強調 / F-121）", () => {
  const sections = [midnight, morning, forenoon]; // 00:00 / 06:00 / 09:00

  it("表示日が今日でなければ、時刻がどこかのセクション内でも current は無い（終了予定 F-104 と同じ規律）", () => {
    expect(currentSectionId(sections, "06:30", false)).toBeNull();
  });

  it("表示日が今日なら、現在時刻を含む有効セクションの id を返す", () => {
    expect(currentSectionId(sections, "06:30", true)).toBe(morning.id);
  });

  it("セクションの開始時刻ちょうどはそのセクションが current になる", () => {
    expect(currentSectionId(sections, "06:00", true)).toBe(morning.id);
    expect(currentSectionId(sections, "00:00", true)).toBe(midnight.id);
  });

  it("先頭セクションの開始より前の時刻は、日をまたいで続く最後のセクションが current（§4.3 の固定項目もこの定義に従う）", () => {
    const withoutMidnight = [morning, forenoon]; // 06:00 / 09:00
    expect(currentSectionId(withoutMidnight, "03:00", true)).toBe(forenoon.id);
    expect(currentSectionId(sections, "23:59", true)).toBe(forenoon.id);
  });

  it("有効セクションが無ければ（全件アーカイブ済み等）today でも null", () => {
    const archived = section({ id: 9, startTime: "07:00", isArchived: true });
    expect(currentSectionId([archived], "07:30", true)).toBeNull();
  });
});

describe("activeSections（画面定義書03 §3.1: start_time 昇順で自動決定）", () => {
  it("有効セクションのみを開始時刻昇順で返す", () => {
    const archived = section({ id: 4, startTime: "03:00", isArchived: true });
    expect(activeSections([forenoon, archived, midnight, morning]).map((s) => s.id)).toEqual([
      3, 1, 2,
    ]);
  });
});

describe("validateSectionInput（画面定義書03 §3.1: 有効セクション間の start_time 重複はエラー）", () => {
  it("名前が空ならエラー", () => {
    const r = validateSectionInput({ name: "  ", startTime: "07:00" }, []);
    expect(r).toEqual({ ok: false, error: "name_required" });
  });

  it("時刻形式が不正ならエラー", () => {
    const r = validateSectionInput({ name: "朝", startTime: "25:00" }, []);
    expect(r).toEqual({ ok: false, error: "invalid_start_time" });
  });

  it("有効セクションと開始時刻が重複したらエラー", () => {
    const r = validateSectionInput({ name: "早朝", startTime: "06:00" }, [morning]);
    expect(r).toEqual({ ok: false, error: "duplicate_start_time" });
  });

  it("アーカイブ済みセクションとの開始時刻重複は許す", () => {
    const archived = section({ id: 9, startTime: "06:00", isArchived: true });
    const r = validateSectionInput({ name: "早朝", startTime: "06:00" }, [archived]);
    expect(r.ok).toBe(true);
  });

  it("編集時、自分自身の開始時刻は重複と見なさない", () => {
    const r = validateSectionInput({ name: "朝（改）", startTime: "06:00" }, [morning], morning.id);
    expect(r).toEqual({ ok: true, value: { name: "朝（改）", startTime: "06:00" } });
  });

  it("名前は前後の空白を除去し、DB形式の時刻（HH:MM:SS）も受け付ける", () => {
    const r = validateSectionInput({ name: " 夜 ", startTime: "18:00:00" }, []);
    expect(r).toEqual({ ok: true, value: { name: "夜", startTime: "18:00" } });
  });
});

describe("canArchive（画面定義書03 §3.1: 有効なセクションは最低1件必要）", () => {
  it("他に有効セクションが残るならアーカイブできる", () => {
    expect(canArchive([morning, forenoon], morning.id)).toEqual({ ok: true, value: morning.id });
  });

  it("最後の有効セクションはアーカイブできない", () => {
    const archived = section({ id: 9, startTime: "12:00", isArchived: true });
    expect(canArchive([morning, archived], morning.id)).toEqual({
      ok: false,
      error: "last_active_section",
    });
  });

  it("日界セクションはアーカイブできない（F-116: 先に別セクションを日界にする）", () => {
    const dayStart = section({ id: 1, name: "朝", startTime: "06:00", isDayStart: true });
    expect(canArchive([dayStart, forenoon], dayStart.id)).toEqual({
      ok: false,
      error: "day_start_section",
    });
  });
});

describe("dayStartTimeOf / byDayStartOrder（F-116: 日界セクション起点の回転）", () => {
  const dayStartMorning = section({ id: 1, name: "朝", startTime: "06:00", isDayStart: true });
  const order = (sections: Section[], dayStart: string) =>
    [...sections].sort(byDayStartOrder(dayStart)).map((s) => s.startTime);

  it("日界セクションの開始時刻を返す。指定がなければ 00:00 にフォールバック", () => {
    expect(dayStartTimeOf([midnight, morning, forenoon])).toBe("00:00");
    expect(dayStartTimeOf([dayStartMorning, forenoon, midnight])).toBe("06:00");
  });

  it("アーカイブ済みの日界セクションは無視して 00:00 にフォールバックする", () => {
    const archivedDayStart = section({
      id: 1,
      name: "朝",
      startTime: "06:00",
      isDayStart: true,
      isArchived: true,
    });
    expect(dayStartTimeOf([archivedDayStart, forenoon])).toBe("00:00");
  });

  it("dayStartOffset は日界からの巡回距離（分）を返す", () => {
    expect(dayStartOffset("06:00", "06:00")).toBe(0);
    expect(dayStartOffset("00:00", "06:00")).toBe(1080); // 06:00 から見て 00:00 は 18時間後
  });

  it("日界を先頭に (start − 日界 + 24h) % 24h 昇順で並べる", () => {
    expect(order([midnight, dayStartMorning, forenoon], "06:00")).toEqual([
      "06:00",
      "09:00",
      "00:00",
    ]);
  });

  it("日界が 00:00（既定）なら start_time 昇順に一致する", () => {
    expect(order([forenoon, midnight, morning], "00:00")).toEqual(["00:00", "06:00", "09:00"]);
  });

  it("日界を明示するとその起点で回す", () => {
    expect(order([midnight, morning, forenoon], "09:00")).toEqual(["09:00", "00:00", "06:00"]);
  });
});
