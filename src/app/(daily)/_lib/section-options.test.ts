import { describe, expect, it } from "vitest";
import type { Section } from "@/domain/section/section";
import { toSectionOptions } from "./section-options";

function section(over: Partial<Section> & { id: number; name: string; startTime: string }): Section {
  return { isArchived: false, ...over };
}

const midnight = section({ id: 1, name: "深夜", startTime: "00:00" });
const morning = section({ id: 2, name: "朝", startTime: "06:00" });
const forenoon = section({ id: 3, name: "午前", startTime: "09:00" });
// 回転順（F-116）で渡される想定の並び。並べ替えずそのまま候補順にする
const sections = [midnight, morning, forenoon];

describe("toSectionOptions（画面定義書01 O-5 / FB-46: 候補に時間帯を付記する）", () => {
  it("未分類を先頭に置き、渡された順のまま各セクションに `開始–終了` を付記する", () => {
    expect(toSectionOptions(sections, null)).toEqual([
      { id: null, label: "未分類" },
      { id: 1, label: "深夜", hint: "00:00–06:00" },
      { id: 2, label: "朝", hint: "06:00–09:00" },
      { id: 3, label: "午前", hint: "09:00–00:00" },
    ]);
  });

  it("回転順（F-116）で渡された並びを崩さない", () => {
    const rotated = toSectionOptions([morning, forenoon, midnight], null);
    expect(rotated.map((o) => o.label)).toEqual(["未分類", "朝", "午前", "深夜"]);
  });

  it("アーカイブ済みセクションは候補に出さない（画面定義書03 §4）", () => {
    const archived = section({ id: 9, name: "旧", startTime: "12:00", isArchived: true });
    const options = toSectionOptions([...sections, archived], null);
    expect(options.map((o) => o.id)).toEqual([null, 1, 2, 3]);
  });

  it("有効セクションが1件なら時間帯は丸1日（終了が自身の開始へ折り返す）", () => {
    expect(toSectionOptions([morning], null)).toEqual([
      { id: null, label: "未分類" },
      { id: 2, label: "朝", hint: "06:00–06:00" },
    ]);
  });
});

describe("toSectionOptions（画面定義書01 §4.3: セクション選択の「現在のセクションへ」）", () => {
  it("先頭に固定項目を置き、表記は `現在のセクションへ（〈セクション名〉）`。実候補はそのまま下に並ぶ", () => {
    // 固定項目は時間帯（hint）を持たず、重複する id 2 の実候補にも印は付かない（§4.3）
    expect(toSectionOptions(sections, 2)).toEqual([
      { id: 2, label: "現在のセクションへ（朝）", isPinned: true },
      { id: null, label: "未分類" },
      { id: 1, label: "深夜", hint: "00:00–06:00" },
      { id: 2, label: "朝", hint: "06:00–09:00" },
      { id: 3, label: "午前", hint: "09:00–00:00" },
    ]);
  });

  it("現在セクションが候補の末尾でも固定項目は先頭に来る", () => {
    const options = toSectionOptions(sections, 3);
    expect(options[0]).toEqual({ id: 3, label: "現在のセクションへ（午前）", isPinned: true });
    expect(options.filter((o) => o.isPinned === true)).toHaveLength(1);
  });

  it("表示日が今日でないとき（currentSectionId が null）は固定項目を出さず、先頭は未分類", () => {
    const options = toSectionOptions(sections, null);
    expect(options[0]).toEqual({ id: null, label: "未分類" });
    expect(options.some((o) => o.isPinned === true)).toBe(false);
  });

  it("アーカイブ済みセクションは固定項目にも昇格させない（候補に出さないものを選ばせない）", () => {
    const archived = section({ id: 9, name: "旧", startTime: "12:00", isArchived: true });
    const options = toSectionOptions([...sections, archived], archived.id);
    expect(options.some((o) => o.isPinned === true)).toBe(false);
  });

  it("候補に無いセクションidを渡しても固定項目は出さない", () => {
    expect(toSectionOptions(sections, 99).some((o) => o.isPinned === true)).toBe(false);
  });

  it("有効セクションが0件（全件アーカイブ）なら未分類だけを返す", () => {
    const archived = section({ id: 9, name: "旧", startTime: "12:00", isArchived: true });
    expect(toSectionOptions([archived], archived.id)).toEqual([{ id: null, label: "未分類" }]);
  });
});
