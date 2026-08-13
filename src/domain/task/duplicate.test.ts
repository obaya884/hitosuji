import { describe, expect, it } from "vitest";
import { duplicateDraft } from "./duplicate";
import { task } from "./testing/task";

const startedAt = new Date("2026-07-26T08:00:00Z");
const endedAt = new Date("2026-07-26T08:30:00Z");

describe("duplicateDraft（F-111: 名前・見積もり満額・モード・プロジェクトを引き継ぐ）", () => {
  // 名前は素通しなので、再開タスクの「（再開）」も接尾辞ごと写る（データモデル定義書 §4.2）
  it("引き継ぐ属性だけを取り出す", () => {
    const original = task({ id: 1, estimateMinutes: 45, modeId: 2, projectId: 3 });
    expect(duplicateDraft(original)).toEqual({
      name: "T1",
      estimateMinutes: 45,
      modeId: 2,
      projectId: 3,
    });
  });

  it("実績のある完了タスクでも見積もりは満額を引き継ぐ", () => {
    const original = task({ id: 1, estimateMinutes: 30, startedAt, endedAt });
    expect(duplicateDraft(original).estimateMinutes).toBe(30);
  });

  // ハイライト（F-118）を引き継がないのは、複製が「同じ仕事の続き」ではなく別の実施だから
  it("routine_id・split_parent_id・コメント・ハイライトは引き継がない", () => {
    const original = task({
      id: 1,
      routineId: 9,
      splitParentId: 8,
      comment: "メモ",
      highlighted: true,
    });
    const draft = duplicateDraft(original);
    expect(draft).not.toHaveProperty("routineId");
    expect(draft).not.toHaveProperty("splitParentId");
    expect(draft).not.toHaveProperty("comment");
    expect(draft).not.toHaveProperty("highlighted");
  });
});
