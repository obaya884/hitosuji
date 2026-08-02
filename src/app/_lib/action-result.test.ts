import { afterEach, describe, expect, it, vi } from "vitest";

import {
  callAction,
  failure,
  handleActionFailure,
  isUnreachable,
  type ActionResult,
} from "./action-result";
import { SAVE_FAILED } from "./error-messages";

// 各テストで console.error を黙らせるので、ここで本物へ戻す（unit 段には共通の setup が無い）
afterEach(() => {
  vi.restoreAllMocks();
});

const serverFailure: ActionResult = { ok: false, message: "タスクが見つかりませんでした" };

describe("callAction（00_共通 §4.1: 拒否を失敗の結果へ落とす）", () => {
  it("拒否は「保存に失敗しました」の失敗になり、届かなかった印が付く", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("Failed to fetch");

    const result = await callAction(async () => {
      throw cause;
    });

    expect(result).toEqual({ ok: false, message: SAVE_FAILED, unreachable: true });
    // 文言に原因は出ないので、投げられたものがコンソールに残ることが唯一の手がかりになる
    expect(logged).toHaveBeenCalledOnce();
    expect(logged.mock.calls[0]).toContain(cause);
  });

  it("Error でないものを投げても同じ結果になる（拒否の値に依らない）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await callAction(async () => {
      throw "文字列で投げられた";
    });

    expect(result).toEqual({ ok: false, message: SAVE_FAILED, unreachable: true });
  });

  it("サーバが返した失敗はそのまま通し、届かなかった印を付けない", async () => {
    expect(await callAction(async () => serverFailure)).toBe(serverFailure);
  });

  it("成功時の追加フィールドを保つ（生成 id・スナップショットを返すアクションを通せる）", async () => {
    const created: ActionResult & Readonly<{ createdId?: number }> = { ok: true, createdId: 7 };

    expect(await callAction(async () => created)).toBe(created);
  });

  // 拒否だけがログの対象。成功やサーバ由来の失敗で吐き始めると、通常運用でコンソールが埋まる
  it("拒否でない結果ではログを出さない", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await callAction(async () => ({ ok: true }) as ActionResult);
    await callAction(async () => serverFailure);

    expect(logged).not.toHaveBeenCalled();
  });
});

describe("isUnreachable（00_共通 §4.1: 取り直しに行くかの判断）", () => {
  it("サーバが返した失敗は false（＝取り直しに行く）", () => {
    expect(isUnreachable({ ok: false, message: "タスクが見つかりませんでした" })).toBe(false);
  });

  it("届かなかった失敗は true（＝取り直しに行かない）", () => {
    expect(isUnreachable({ ok: false, message: SAVE_FAILED, unreachable: true })).toBe(true);
  });
});

describe("failure（00_共通 §4.1: サーバが返した失敗）", () => {
  it("渡された文言だけを持つ失敗を作る", () => {
    expect(failure("タスクが見つかりませんでした")).toEqual({
      ok: false,
      message: "タスクが見つかりませんでした",
    });
  });

  // すべての Server Action の失敗はここを通るので、届かなかった印が紛れ込むと全画面が
  // 取り直しをやめる。作る側と判定する側を1本で結んでおく
  it("届かなかった印は付けない（＝取り直しに行く側）", () => {
    expect(isUnreachable(failure("タスクが見つかりませんでした"))).toBe(false);
  });
});

// ここで見るのは §4.1 の規則そのもの。各フックの段（`use-server-action.test.tsx` /
// `daily-board.optimistic.test.tsx`）が見るのは、その規則へ配線されているか
describe("handleActionFailure（00_共通 §4.1: 失敗の表示と後始末）", () => {
  function spies() {
    return { setError: vi.fn(), refresh: vi.fn() };
  }

  it("サーバが返した失敗は、文言を出したうえで表示中のデータを取り直す", () => {
    const handlers = spies();

    handleActionFailure({ ok: false, message: "タスクが見つかりませんでした" }, handlers);

    expect(handlers.setError).toHaveBeenCalledExactlyOnceWith("タスクが見つかりませんでした");
    expect(handlers.refresh).toHaveBeenCalledOnce();
  });

  it("届かなかった失敗は文言だけ出し、取り直しに行かない（また失敗するだけのため）", () => {
    const handlers = spies();

    handleActionFailure({ ok: false, message: SAVE_FAILED, unreachable: true }, handlers);

    expect(handlers.setError).toHaveBeenCalledExactlyOnceWith(SAVE_FAILED);
    expect(handlers.refresh).not.toHaveBeenCalled();
  });
});
