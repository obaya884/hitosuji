import { describe, expect, it } from "vitest";
import { routine } from "./testing/routine";
import { routineTaskContent } from "./task-content";

// `toEqual` は余剰プロパティで落ちるので、**持たないもの**（配置＝セクション・並び順、
// ルーチンとの紐付け）もこの1件が同時に固定している——展開は開始想定時刻からセクションを
// 導いて紐付け、コピー（F-307）は未分類の末尾へ置いて紐付けない、という違いがここに入り込まない
describe("routineTaskContent（データモデル定義書 §4.1-3 / 要件定義書 §5.3 F-307）", () => {
  it("名前・見積もり・モード・プロジェクト・バンドル・URL だけを写す", () => {
    expect(
      routineTaskContent(
        routine({
          id: 1,
          name: "朝食",
          estimateMinutes: 20,
          modeId: 3,
          projectId: 4,
          bundleId: 5,
          url: "https://example.com/a",
        })
      )
    ).toEqual({
      name: "朝食",
      estimateMinutes: 20,
      modeId: 3,
      projectId: 4,
      bundleId: 5,
      url: "https://example.com/a",
    });
  });

});
