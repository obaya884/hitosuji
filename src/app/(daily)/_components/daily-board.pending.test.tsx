// 盤面テスト（`daily-board.*.test.tsx`）のうち**確定を待つ操作**（00_共通 §4.2）を持つファイル。
// 進行中の合図（猶予を超えたときだけ出す）と再発火の抑止、そして**楽観的更新の操作が
// 巻き添えにならないこと**（N-01 の体感を変えない）。
// **代表は先送り（O-7）**——確定を待つ操作の判定は `optimistic` の有無1点なので、入口ごとに
// 同じ分岐を再訪しても増えない。入口を足すのは**別の条項を通すとき**だけ（ルーチン化 O-12 は
// 合図と完了トーストの入れ替わり、取り消しの実行 O-8 は抑止時に保留を失わないこと）
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
  postponeTaskAction,
  restoreTaskAction,
  suspendTaskAction,
  type CreatingActionResult,
  type DailyActionResult,
} from "../actions";
import {
  COMPLETED,
  commit,
  CREATED,
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

const postpone = (name: string) => chooseRowMenu(name, "翌日へ先送り");

/** 進行中の合図。文言ではなく役割で探す（`role="status"` を持つのは合図だけ） */
const indicator = () => screen.queryByRole("status");

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("確定を待つ操作（00_共通 §4.2）", () => {
  describe("進行中の合図", () => {
    it("応答が猶予を超えたら「保存中」を出し、届いたら消す", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await postpone(NOT_STARTED);
      expect(indicator()).toBeNull();

      await advance(SLOW_PENDING_DELAY_MS);
      expect(indicator()?.textContent).toBe("保存中");

      await gate.resolve(OK);
      expect(indicator()).toBeNull();
    });

    // 速い操作に合図を出すと点滅にしかならない（この遅延が条項の要点）
    it("猶予の直前に届いた応答では一度も出さない", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await postpone(NOT_STARTED);
      await advance(SLOW_PENDING_DELAY_MS - 1);
      expect(indicator()).toBeNull();

      await gate.resolve(OK);
      await advance(SLOW_PENDING_DELAY_MS);
      expect(indicator()).toBeNull();
    });

    // §4.2 の「合図の消え方」は成功に限定していない。失敗でも消えないと合図が残り続ける
    it("失敗で終わっても合図は消え、エラートーストと同時には出ない", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await postpone(NOT_STARTED);
      await advance(SLOW_PENDING_DELAY_MS);
      expect(indicator()).not.toBeNull();

      await gate.resolve({ ok: false, message: "先送りできるのは未実行タスクだけです" });

      expect(indicator()).toBeNull();
      expect(screen.queryByText("先送りできるのは未実行タスクだけです")).not.toBeNull();

      // 失敗で抑止が解けないと、盤面が二度と動かなくなる。**合図のタイミングに依らせない**ため
      // ここで見る（猶予前に失敗する経路の方が実際には多い）
      vi.mocked(postponeTaskAction).mockResolvedValue(OK);
      await postpone(NOT_STARTED);
      expect(vi.mocked(postponeTaskAction)).toHaveBeenCalledTimes(2);
    });

    // 合図と完了トーストの両方を出す唯一の操作（O-12）。入れ替わりはここでしか通せない
    it("完了トーストを出す操作（ルーチン化 O-12）では合図と入れ替わる", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(createRoutineFromTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await chooseRowMenu(NOT_STARTED, "ルーチン化");
      await click(screen.getByRole("button", { name: "作成" }));
      await advance(SLOW_PENDING_DELAY_MS);
      expect(indicator()).not.toBeNull();

      await gate.resolve(OK);

      expect(indicator()).toBeNull();
      expect(screen.queryByText(`「${NOT_STARTED}」をルーチン化しました（明日から展開）`)).not.toBeNull();
    });

    // 条項は「**同時に出るときは**同じ列に積む」。別の置き場に出すと画面上で重なるので、
    // トーストを出したまま合図を出して、両方が同じ親に並ぶことを見る（§4.2「合図の見た目・位置」）
    it("トーストと同時に出るときは同じ列に積む", async () => {
      renderBoard();
      selectRow(NOT_STARTED);
      await pressAndSettle("d"); // 削除の Undo トーストを出したままにする

      const gate = hold<DailyActionResult>(OK);
      vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
      await chooseRowMenu(RUNNING, "中断");
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
  });

  describe("再発火の抑止", () => {
    // 止めないと、2発目が先送り済みのタスクをもう1日ずらす（Server Action は直列に届くので
    // 同時ではなく順に適用される。アーキテクチャ定義書 §7）
    it("応答を待つあいだ、確定を待つ操作を受け付けない", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await postpone(NOT_STARTED);
      await postpone(NOT_STARTED);

      expect(vi.mocked(postponeTaskAction)).toHaveBeenCalledOnce();
      await gate.resolve(OK);
    });

    // 条項は「確定を待つ操作をすべて」「対象の行が違っても」と書いている。
    // `run` と `runSelectingCreated` が同じ状態を共有していることもここで固定される
    it("別の行の別の種類の操作も受け付けない", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await postpone(NOT_STARTED);
      selectRow(COMPLETED);
      await pressAndSettle("y");

      expect(vi.mocked(duplicateTaskAction)).not.toHaveBeenCalled();
      await gate.resolve(OK);
    });

    // 抑止で捨てると、トーストだけ消えて復元も走らず取り消す手段が無くなる
    // （00_共通 §2.2「Undo が有効なのはトーストが出ているあいだ」/ §4.2「何も起きない」）
    it("抑止に当たった取り消しは保留を失わない（O-8）", async () => {
      renderBoard();
      selectRow(NOT_STARTED);
      await pressAndSettle("d");
      expect(screen.queryByRole("button", { name: "取り消す" })).not.toBeNull();

      // 別の確定待ち操作を飛ばす（先送りは未実行行だけなので、削除した行とは別に中断を使う）
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
      await chooseRowMenu(RUNNING, "中断");

      await click(screen.getByRole("button", { name: "取り消す" }));

      expect(vi.mocked(restoreTaskAction)).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "取り消す" })).not.toBeNull();
      // 「何も起きない（**エラーは出さない**）」の後半（§4.2）
      expect(screen.queryByText("保存に失敗しました")).toBeNull();
      await gate.resolve(OK);
    });

    // 同型の「押した側の状態を先に進める」経路。閉じると選んだ繰り返し・開始想定時刻が黙って消える
    it("抑止に当たったルーチン化はポップオーバーを閉じない（O-12）", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
      renderBoard();
      await chooseRowMenu(RUNNING, "中断");

      await chooseRowMenu(NOT_STARTED, "ルーチン化");
      await click(screen.getByRole("button", { name: "作成" }));

      expect(vi.mocked(createRoutineFromTaskAction)).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "作成" })).not.toBeNull();
      await gate.resolve(OK);
    });

    // 生成系の楽観側。ここまで止めるとクイック追加が待たされて N-01 を損なう
    it("応答を待つあいだもクイック追加は受け付ける", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
      renderBoard();
      await postpone(NOT_STARTED);

      await act(async () => {
        commit(quickAddInput(), "新しいタスク");
      });

      expect(vi.mocked(addTaskAction)).toHaveBeenCalledOnce();
      await gate.resolve(OK);
    });

    it("応答が届けば次の確定を待つ操作を受け付ける", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await postpone(NOT_STARTED);
      await gate.resolve(OK);

      vi.mocked(postponeTaskAction).mockResolvedValue(OK);
      await postpone(NOT_STARTED);

      expect(vi.mocked(postponeTaskAction)).toHaveBeenCalledTimes(2);
    });

    // 生成系（複製・複製して開始・クイック追加）は別の入口（`runSelectingCreated`）を通る。
    // 複製は採番をサーバが決めるので確定を待つ側で、止めないと2つできる
    it("生成系の確定を待つ操作（複製 O-11）にも同じ抑止が掛かる", async () => {
      const gate = hold<CreatingActionResult>(CREATED);
      vi.mocked(duplicateTaskAction).mockReturnValue(gate.promise);
      renderBoard();
      selectRow(NOT_STARTED);

      await pressAndSettle("y");
      await pressAndSettle("y");

      expect(vi.mocked(duplicateTaskAction)).toHaveBeenCalledOnce();
      await gate.resolve(CREATED);
    });

    // 抑止の範囲は「確定を待つ操作」まで。ここを広げると打刻が待たされて N-01 を損なう
    it("応答を待つあいだも楽観的更新の操作は受け付ける", async () => {
      const gate = hold<DailyActionResult>(OK);
      vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
      renderBoard();

      await postpone(NOT_STARTED);
      await click(within(taskRow(RUNNING)).getByLabelText("終了"));

      expect(vi.mocked(finishTaskAction)).toHaveBeenCalledOnce();
      await gate.resolve(OK);
    });
  });
});
