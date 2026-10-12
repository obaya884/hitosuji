// 盤面テスト（`daily-board.*.test.tsx`）のうち**確定を待つ操作**（00_共通 §4.2）を持つファイル。
// 進行中の合図（猶予を超えたときだけ出す）と再発火の抑止、そして**楽観的更新の操作が
// 巻き添えにならないこと**（N-01 の体感を変えない）。
// 確定を待つ操作は ルーチン化（O-12）と保留の取り消しの実行（O-8 / O-15）だけ（画面定義書01 §4 冒頭）。
// **代表はルーチン化**——確定を待つ操作の判定は `optimistic` の有無1点なので、入口ごとに
// 同じ分岐を再訪しても増えない。取り消しの実行（O-8）を通すのは**別の条項を見るとき**だけ
// （抑止に当たっても保留を失わないこと）
import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasClass } from "@/app/_testing/dom";
import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { SLOW_PENDING_DELAY_MS } from "@/app/_lib/use-slow-pending";

import {
  addTaskAction,
  createRoutineFromTaskAction,
  duplicateTaskAction,
  finishTaskAction,
  moveTaskDateAction,
  restoreTaskAction,
  suspendTaskAction,
  type DailyActionResult,
} from "../actions";
import {
  COMPLETED,
  commit,
  hold,
  NOT_STARTED,
  NOW,
  OK,
  pressAndSettle,
  quickAddInput,
  renderBoard,
  RUNNING,
  selectRow,
  setupBoard,
} from "../_testing/board-helpers";
import { taskRow } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

beforeEach(() => {
  // `setupBoard` は Date だけを偽物にする。猶予の測定に使う setTimeout もテストが握る
  // （時計は据え置き、タイマーだけ足す。`NOW` を明示してフックの登録順に依らせない）
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: NOW });
});

/** 行メニュー（O-7 / O-12 の導線）から項目を選ぶ */
async function chooseRowMenu(name: string, label: string) {
  clickWithoutServer(within(taskRow(name)).getByLabelText("行メニュー"));
  await click(screen.getByRole("button", { name: label }));
}

/** ルーチン化（O-12）を行メニューから作成まで進める。確定を待つ操作の代表 */
async function routinize(name: string) {
  await chooseRowMenu(name, "ルーチン化");
  await click(screen.getByRole("button", { name: "作成" }));
}

/** 進行中の合図。文言ではなく役割で探す（`role="status"` を持つのは合図だけ） */
const indicator = () => screen.queryByRole("status");

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("確定を待つ操作（00_共通 §4.2）", () => {
  describe("進行中の合図", () => {
    // 合図と完了トーストの両方を出す（O-12）。合図が先に消え、完了トーストと入れ替わる
    it("応答が猶予を超えたら「保存中」を出し、届いたら完了トーストと入れ替わる", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await routinize(NOT_STARTED);
      expect(indicator()).toBeNull();

      await advance(SLOW_PENDING_DELAY_MS);
      expect(indicator()?.textContent).toBe("保存中");

      await gate.resolve(OK);

      expect(indicator()).toBeNull();
      expect(screen.queryByText(`「${NOT_STARTED}」をルーチン化しました（明日から展開）`)).not.toBeNull();
    });

    it("失敗で終わっても合図は消え、エラートーストと同時には出ない", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await routinize(NOT_STARTED);
      await advance(SLOW_PENDING_DELAY_MS);
      expect(indicator()).not.toBeNull();

      await gate.resolve({ ok: false, message: "保存に失敗しました" });

      expect(indicator()).toBeNull();
      expect(screen.queryByText("保存に失敗しました")).not.toBeNull();

      // 失敗で抑止が解けないと、盤面が二度と動かなくなる。**合図のタイミングに依らせない**ため
      // ここで見る（猶予前に失敗する経路の方が実際には多い）
      vi.mocked(createRoutineFromTaskAction).mockResolvedValue(OK);
      await routinize(NOT_STARTED);
      expect(vi.mocked(createRoutineFromTaskAction)).toHaveBeenCalledTimes(2);
    });

    // 条項は「**同時に出るときは**同じ列に積む」。別の置き場に出すと画面上で重なるので、
    // トーストを出したまま合図を出して、両方が同じ親に並ぶことを見る（00_共通 §4.2「合図の見た目・位置」）
    it("トーストと同時に出るときは同じ列に積む", async () => {
      renderBoard();
      selectRow(NOT_STARTED);
      await pressAndSettle("d"); // 削除の Undo トーストを出したままにする

      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      await routinize(RUNNING);
      await advance(SLOW_PENDING_DELAY_MS);

      const stack = (indicator() as HTMLElement).parentElement;
      const toast = screen.getByRole("button", { name: "取り消す" }).closest("div");
      expect(stack).toBe(toast?.parentElement);
      expect(hasClass(stack as HTMLElement, "bottom-4")).toBe(true);
      await gate.resolve(OK);
    });

    // 楽観的更新の操作で合図が出ると、打刻のたびに画面下部が光ることになる
    it("楽観的更新の操作では猶予を超えても出さない", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await click(within(taskRow(RUNNING)).getByLabelText("終了"));
      await advance(SLOW_PENDING_DELAY_MS * 2);

      expect(indicator()).toBeNull();
      await gate.resolve(OK);
    });

    // 2026-10-12 に確定を待つ側から楽観的更新へ移った操作（画面定義書01 §4 冒頭）。合図が残ると移した意味が無い
    it.each([
      ["中断", () => chooseRowMenu(RUNNING, "中断"), suspendTaskAction],
      ["日付移動", () => chooseRowMenu(NOT_STARTED, "翌日へ先送り"), moveTaskDateAction],
    ] as const)("%s（確定前に出す操作）でも猶予を超えて出さない", async (_, operate, action) => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(action).mockReturnValue(gate.promise);
      renderBoard();

      await operate();
      await advance(SLOW_PENDING_DELAY_MS * 2);

      expect(indicator()).toBeNull();
      await gate.resolve(OK);
    });
  });

  describe("再発火の抑止", () => {
    // 止めないと、同じタスクからルーチンが2つできる（Server Action は直列に届くので順に適用される。
    // アーキテクチャ定義書 §7）
    it("応答を待つあいだ、確定を待つ操作を受け付けない", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await routinize(NOT_STARTED);
      await routinize(NOT_STARTED);

      expect(vi.mocked(createRoutineFromTaskAction)).toHaveBeenCalledOnce();
      await gate.resolve(OK);
    });

    // 抑止で捨てると、トーストだけ消えて復元も走らず取り消す手段が無くなる
    // （00_共通 §2.2「Undo が有効なのはトーストが出ているあいだ」/ §4.2「何も起きない」）。
    // 条項の「確定を待つ操作をすべて」「対象の行が違っても」もここで通る（別の行・別の種類）
    it("抑止に当たった取り消しは保留を失わない（O-8）", async () => {
      renderBoard();
      selectRow(NOT_STARTED);
      await pressAndSettle("d");
      expect(screen.queryByRole("button", { name: "取り消す" })).not.toBeNull();

      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      await routinize(RUNNING);

      await click(screen.getByRole("button", { name: "取り消す" }));

      expect(vi.mocked(restoreTaskAction)).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "取り消す" })).not.toBeNull();
      // 「何も起きない（**エラーは出さない**）」の後半（00_共通 §4.2）
      expect(screen.queryByText("保存に失敗しました")).toBeNull();
      await gate.resolve(OK);
    });

    // 同型の「押した側の状態を先に進める」経路。閉じると選んだ繰り返し・開始想定時刻が黙って消える
    it("抑止に当たったルーチン化はポップオーバーを閉じない（O-12）", async () => {
      renderBoard();
      selectRow(NOT_STARTED);
      await pressAndSettle("d");
      // 取り消しの実行（確定を待つ操作）を応答待ちのままにする
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(restoreTaskAction).mockReturnValue(gate.promise);
      await click(screen.getByRole("button", { name: "取り消す" }));

      await routinize(RUNNING);

      expect(vi.mocked(createRoutineFromTaskAction)).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "作成" })).not.toBeNull();
      await gate.resolve(OK);
    });

    // 生成系の楽観側。ここまで止めるとクイック追加が待たされて N-01 を損なう
    it("応答を待つあいだもクイック追加は受け付ける", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      renderBoard();
      await routinize(NOT_STARTED);

      await act(async () => {
        commit(quickAddInput(), "新しいタスク");
      });

      expect(vi.mocked(addTaskAction)).toHaveBeenCalledOnce();
      await gate.resolve(OK);
    });

    it("応答が届けば次の確定を待つ操作を受け付ける", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await routinize(NOT_STARTED);
      await gate.resolve(OK);

      vi.mocked(createRoutineFromTaskAction).mockResolvedValue(OK);
      await routinize(NOT_STARTED);

      expect(vi.mocked(createRoutineFromTaskAction)).toHaveBeenCalledTimes(2);
    });

    // 抑止の範囲は「確定を待つ操作」まで。ここを広げると打刻が待たされて N-01 を損なう。
    // 複製（O-11）は生成系の入口（`runSelectingCreated`）を通るが、確定前に仮の行を出す側なので止めない
    it.each([
      ["終了", () => click(within(taskRow(RUNNING)).getByLabelText("終了")), finishTaskAction],
      ["複製", () => chooseRowMenu(NOT_STARTED, "複製"), duplicateTaskAction],
    ] as const)("応答を待つあいだも楽観的更新の操作（%s）は受け付ける", async (_, operate, action) => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await routinize(COMPLETED);
      await operate();

      expect(vi.mocked(action)).toHaveBeenCalledOnce();
      await gate.resolve(OK);
    });
  });
});
