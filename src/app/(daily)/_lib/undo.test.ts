import { describe, expect, it } from "vitest";
import type { CompletionSnapshot } from "@/usecases/task/punch-usecases";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { pendingUndoMessage } from "./undo";

// 保留は削除と完了の取り消しで共通の1スロット（画面定義書01 O-13）。文言だけが種類で分かれる。
const SNAPSHOT: CompletionSnapshot = {
  taskId: 13,
  startedAt: atJst("08:00"),
  endedAt: atJst("08:30"),
  sectionId: 1,
  sortOrder: 1000,
};

describe("pendingUndoMessage（Undoトーストの文言。O-8 / O-15）", () => {
  it("削除は「削除しました」。名前は保持した `name` から引く（画面から引けないため）", () => {
    // task.name とずれても文言は `name` に従う（削除時に控えた表示名が正）
    const message = pendingUndoMessage({
      type: "delete",
      name: "控えた名前",
      task: task({ id: 11, name: "別の名前" }),
    });

    expect(message).toBe("「控えた名前」を削除しました");
  });

  it("完了の取り消しは「未実行に戻しました」", () => {
    const message = pendingUndoMessage({ type: "uncomplete", name: "掃除", snapshot: SNAPSHOT });

    expect(message).toBe("「掃除」を未実行に戻しました");
  });
});
