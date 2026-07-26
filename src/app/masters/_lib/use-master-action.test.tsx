import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ActionResult } from "./action-result";
import { deferredAction } from "../_testing/table-helpers";
import { useMasterAction } from "./use-master-action";

const ok = (): ActionResult => ({ ok: true });
const failure = (message: string): ActionResult => ({ ok: false, message });

// マスタ管理は N-01（楽観的更新）の対象外で、保存の完了を待って反映する（画面定義書03 §1）
// action が reject（例外）したときの経路は未実装（run は catch していない）。FB-64 で扱うためここでは対象外
describe("useMasterAction（画面定義書03 §1: 保存の完了を待つ。楽観的更新はしない）", () => {
  it("成功なら onSuccess を呼び、エラーは出さない", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useMasterAction());

    await act(async () => {
      result.current.run(async () => ok(), onSuccess);
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it("失敗なら message をエラーとして持ち、onSuccess を呼ばない（00_共通 §2.3「失敗時」）", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useMasterAction());

    await act(async () => {
      result.current.run(async () => failure("名前を入力してください"), onSuccess);
    });

    expect(result.current.error).toBe("名前を入力してください");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("onSuccess を省略しても成功時に落ちない（アーカイブ等の閉じる処理がない操作）", async () => {
    const { result } = renderHook(() => useMasterAction());

    await act(async () => {
      result.current.run(async () => ok());
    });

    expect(result.current.error).toBeNull();
  });

  it("実行前に前回のエラーを消す", async () => {
    const { result } = renderHook(() => useMasterAction());
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
    const { result } = renderHook(() => useMasterAction());

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
    const { result } = renderHook(() => useMasterAction());

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
    const { result } = renderHook(() => useMasterAction());

    await act(async () => {
      result.current.run(async () => failure("対象が見つかりません（画面を再読み込みしてください）"));
    });

    expect(result.current.isPending).toBe(false);
  });

  it("setError で呼び出し側からエラーを消せる（セル編集を始めるときに使う）", async () => {
    const { result } = renderHook(() => useMasterAction());
    await act(async () => {
      result.current.run(async () => failure("名前は50文字以内で入力してください"));
    });

    act(() => {
      result.current.setError(null);
    });

    expect(result.current.error).toBeNull();
  });
});
