import { describe, expect, it } from "vitest";
import { duplicateDraft, insertionIndexForDuplicate } from "./duplicate";
import { task } from "./testing/task";

const startedAt = new Date("2026-07-26T08:00:00Z");
const endedAt = new Date("2026-07-26T08:30:00Z");

describe("duplicateDraft（F-111: 名前・見積もり満額・モード・プロジェクトを引き継ぐ）", () => {
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

describe("insertionIndexForDuplicate（F-111: 未実施のトップへ挿入）", () => {
  it("実行中タスクがあればその直後", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2, startedAt }), // 実行中
      task({ id: 3 }),
    ];
    expect(insertionIndexForDuplicate(tasks)).toBe(2);
  });

  it("実行中がなければ最初の未実行タスクの直前", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2, startedAt, endedAt }),
      task({ id: 3 }), // 最初の未実行
      task({ id: 4 }),
    ];
    expect(insertionIndexForDuplicate(tasks)).toBe(2);
  });

  it("すべて完了ならリスト末尾", () => {
    const tasks = [task({ id: 1, startedAt, endedAt }), task({ id: 2, startedAt, endedAt })];
    expect(insertionIndexForDuplicate(tasks)).toBe(2);
  });

  it("空のリストなら先頭", () => {
    expect(insertionIndexForDuplicate([])).toBe(0);
  });

  it("実行中が最優先（後ろに未実行があっても直後に入れる）", () => {
    const tasks = [task({ id: 1 }), task({ id: 2, startedAt })];
    expect(insertionIndexForDuplicate(tasks)).toBe(2);
  });
});
