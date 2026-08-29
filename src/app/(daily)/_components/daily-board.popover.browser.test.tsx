// ブラウザ段（テスト戦略定義書 §3 / T-03）。FB-42（ポップオーバーで確定した Enter が背後の
// 打刻へ抜ける）を**合成側で**固定する唯一の場所。同じ操作を見る jsdom 側
// （`daily-board.row-operations.test.tsx` の F-112）が押さえるのはショートカット側の
// `editing !== null` ガードだけで、`select-popover.tsx` の `stopPropagation` を外しても緑のまま。
// **2枚目の盾をこちらが押さえる**（実測: 同じ変異でこの段だけが赤くなる）。
//
// 再現には**本物のキー入力**が要る（§3。`fireEvent` では実ブラウザでも緑のまま）。
import { userEvent } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";

import { TEST_DATE } from "@/domain/shared/testing/clock";

import {
  duplicateAndStartTaskAction,
  finishTaskAction,
  setTaskSectionAction,
  startTaskAction,
} from "../actions";
import {
  AFTERNOON,
  COMPLETED,
  FORENOON,
  NOT_STARTED,
  renderBoard,
  setupBoardInBrowser,
} from "../_testing/board-helpers";
import { isSelected, taskRow } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoardInBrowser();

/**
 * 行選択もキーボードで行う（§5 の J/K）。**クリックで選んではいけない**——フォーカスがその行の
 * ボタンに乗り、`Enter` が `use-daily-shortcuts` の `isButtonTarget` ガード（00_共通 §3）で
 * 先に弾かれるので、このファイルが見たい伝播の隙間そのものが起きなくなる（変異が検出できなくなる）。
 * 回数は `defaultTasks` の表示順（午前[未実行, 実行中] → 午後[完了]）に対応する。
 */
async function selectByKeyboard(keys: string, name: string) {
  await userEvent.keyboard(keys);
  expect(isSelected(taskRow(name))).toBe(true);
}

describe("DailyBoard のポップオーバー確定（FB-42: 確定の Enter を背後へ伝播させない）", () => {
  it("未実行行では選択だけが行われ、開始打刻へ抜けない（F-112 / O-3）", async () => {
    renderBoard();
    await selectByKeyboard("j", NOT_STARTED);

    await userEvent.keyboard("s"); // 現在値（午前）がハイライトされた状態で開く
    await userEvent.keyboard("j"); // 次の候補（午後）へ
    await userEvent.keyboard("{Enter}");

    expect(vi.mocked(setTaskSectionAction)).toHaveBeenCalledWith({
      taskId: 11,
      date: TEST_DATE,
      sectionId: AFTERNOON.id,
    });
    expect(vi.mocked(startTaskAction)).not.toHaveBeenCalled();
  });

  it("完了行では複製&開始へ抜けない（FB-42 の原票の症状。O-14）", async () => {
    // 原票が踏んだのは完了行で、抜けた先は「複製して開始」だった。打刻ボタンが disabled でも
    // グローバルの keydown は生きているので、伝播すればここが動く
    renderBoard();
    await selectByKeyboard("jjj", COMPLETED);

    await userEvent.keyboard("s"); // 現在値（午後）から
    await userEvent.keyboard("k"); // 前の候補（午前）へ
    await userEvent.keyboard("{Enter}");

    expect(vi.mocked(setTaskSectionAction)).toHaveBeenCalledWith({
      taskId: 13,
      date: TEST_DATE,
      sectionId: FORENOON.id,
    });
    expect(vi.mocked(duplicateAndStartTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(finishTaskAction)).not.toHaveBeenCalled();
  });
});
