import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { failure, type ActionResult } from "./action-result";
import { deferredAction } from "@/app/_testing/actions";
import { router } from "@/app/_testing/next-navigation";
import { useServerAction } from "./use-server-action";

const ok = (): ActionResult => ({ ok: true });

// マスタ管理・routines は N-01（楽観的更新）の対象外で、保存の完了を待って反映する
// （画面定義書02 §1・03 §1。両画面とも同文で規定）
// spy（console.error）を戻す。`setup.ts` の `clearAllMocks` は呼び出し記録しか消さないため、
// ここで戻さないと以降のテストでも本物のログが黙る
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useServerAction（画面定義書02 §1・03 §1: 保存の完了を待つ。楽観的更新はしない）", () => {
  it("成功なら onSuccess を呼び、エラーは出さない", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction());

    await act(async () => {
      result.current.run(async () => ok(), onSuccess);
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it("失敗なら message をエラーとして持ち、onSuccess を呼ばない（00_共通 §2.3「失敗時」）", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction());

    await act(async () => {
      result.current.run(async () => failure("名前を入力してください"), onSuccess);
    });

    expect(result.current.error).toBe("名前を入力してください");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("onSuccess を省略しても成功時に落ちない（アーカイブ・削除・有効トグル等、閉じる処理がない操作）", async () => {
    const { result } = renderHook(() => useServerAction());

    await act(async () => {
      result.current.run(async () => ok());
    });

    expect(result.current.error).toBeNull();
  });

  it("実行前に前回のエラーを消す", async () => {
    const { result } = renderHook(() => useServerAction());
    await act(async () => {
      result.current.run(async () => failure("同じ開始時刻の有効なセクションがあります"));
    });
    expect(result.current.error).not.toBeNull();

    const { promise, resolve } = deferredAction();
    const action = () => promise;
    act(() => {
      result.current.run(action);
    });

    // まだ解決していない＝実行前の時点でエラーが消えている
    expect(result.current.error).toBeNull();
    await act(async () => {
      resolve(ok());
    });
  });

  it("完了を待ってから onSuccess を呼ぶ（先にUIへ反映しない＝楽観的更新をしない）", async () => {
    const onSuccess = vi.fn();
    const { promise, resolve } = deferredAction();
    const action = () => promise;
    const { result } = renderHook(() => useServerAction());

    act(() => {
      result.current.run(action, onSuccess);
    });
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolve(ok());
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("実行中は isPending が立ち、完了で下がる（保存中の抑止に使う。00_共通 §2.3）", async () => {
    const { promise, resolve } = deferredAction();
    const action = () => promise;
    const { result } = renderHook(() => useServerAction());

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.run(action);
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      resolve(ok());
    });
    expect(result.current.isPending).toBe(false);
  });

  it("失敗で終わっても isPending は下がる（画面が固まらない）", async () => {
    const { result } = renderHook(() => useServerAction());

    await act(async () => {
      result.current.run(async () =>
        failure("対象が見つかりません（すでに削除されている可能性があります）")
      );
    });

    expect(result.current.isPending).toBe(false);
  });

  it("setError で呼び出し側からエラーを消せる（セル編集を始めるときに使う）", async () => {
    const { result } = renderHook(() => useServerAction());
    await act(async () => {
      result.current.run(async () => failure("名前を入力してください"));
    });

    act(() => {
      result.current.setError(null);
    });

    expect(result.current.error).toBeNull();
  });
});

// `router` は段の前提として偽物（`_testing/next-navigation.ts`）なので、ここで観測できるのは
// **取り直しを要求したところまで**。取り直した結果が画面に出るかは実機での確認に委ねる
describe("useServerAction の失敗の扱い（00_共通 §4.1）", () => {
  it("サーバが失敗を返したら表示中のデータを取り直す", async () => {
    const { result } = renderHook(() => useServerAction());

    await act(async () => {
      result.current.run(async () => failure("タスクが見つかりませんでした"));
    });

    expect(result.current.error).toBe("タスクが見つかりませんでした");
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("成功なら取り直さない（サーバ側の revalidate で反映される）", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction());

    await act(async () => {
      result.current.run(async () => ok(), onSuccess);
    });

    expect(onSuccess).toHaveBeenCalledOnce(); // 操作自体は走っている
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("拒否（通信断・タイムアウト）も素通りさせず「保存に失敗しました」を出す（FB-64）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // callAction が出す原因ログを抑える
    const { result } = renderHook(() => useServerAction());

    await act(async () => {
      result.current.run(async () => {
        throw new Error("Failed to fetch");
      });
    });

    expect(result.current.error).toBe("保存に失敗しました");
    expect(result.current.isPending).toBe(false); // 画面が固まらない
    // 届かなかった以上、取り直しに行っても また失敗するだけなので行かない
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("拒否のあとも次の操作を実行できる（run が壊れない）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction());

    await act(async () => {
      result.current.run(async () => {
        throw new Error("Failed to fetch");
      });
    });
    await act(async () => {
      result.current.run(async () => ok(), onSuccess);
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });
});
