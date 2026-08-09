import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Bundle, BundleId } from "@/domain/bundle/bundle";
import type { BundleListView } from "@/usecases/bundle/bundle-usecases";

import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { rowOf } from "./_testing/table-helpers";

// Server Action の先は実DB接続と revalidatePath に届くため、同じ返り値の契約
// （ActionResult）を返す偽物へ差し替える（テスト戦略定義書 §2「偽物を置いてよい境界」）
vi.mock("./actions", () => ({
  createBundleAction: vi.fn(),
  updateBundleAction: vi.fn(),
  setBundleArchivedAction: vi.fn(),
  deleteBundleAction: vi.fn(),
}));

import {
  createBundleAction,
  deleteBundleAction,
  setBundleArchivedAction,
  updateBundleAction,
} from "./actions";
import { BundlesBoard } from "./bundles-board";

// プリセット13色のうちテストで使う3つ（画面定義書03 §3.2 の表の値と同じ。バンドルも共有する）
const RED = "#ef4444";
const BLUE = "#3b82f6";
const GRAY = "#9ca3af";

const bundle = (id: BundleId, name: string, color: string, isArchived = false): Bundle => ({
  id,
  name,
  color,
  isArchived,
});

const ACTIVE = [bundle(1, "朝の立上げ", RED), bundle(2, "週末の整理", BLUE)] as const;

/**
 * 右ペインのヘッダ。選択中バンドルの名前は左ペインの一覧行にも同じ文言で出るため、
 * ヘッダ内の要素だけを見たいクエリはここへ絞る
 */
function rightPaneHeader(): HTMLElement {
  const header = document.querySelector("header");
  if (header === null) throw new Error("右ペインのヘッダが見つかりません");
  return header;
}

function renderBoard(
  props: Partial<{
    active: readonly Bundle[];
    archived: readonly Bundle[];
    deletableIds: readonly BundleId[];
    memberCounts: Readonly<Record<BundleId, number>>;
  }> = {}
) {
  const bundles: BundleListView = {
    active: props.active ?? ACTIVE,
    archived: props.archived ?? [],
    deletableIds: props.deletableIds ?? [],
    memberCounts: props.memberCounts ?? { 1: 4, 2: 0 },
  };
  return render(<BundlesBoard bundles={bundles} />);
}

beforeEach(() => {
  vi.mocked(createBundleAction).mockResolvedValue({ ok: true, id: 99 });
  vi.mocked(updateBundleAction).mockResolvedValue({ ok: true });
  vi.mocked(setBundleArchivedAction).mockResolvedValue({ ok: true });
  vi.mocked(deleteBundleAction).mockResolvedValue({ ok: true });
});

describe("BundlesBoard（画面定義書05: 左ペインの一覧・作成・アーカイブ・削除／右ペインのヘッダ）", () => {
  it("有効なバンドルを渡された順に並べ、色の四角と件数を出す（§3.1）", () => {
    renderBoard();

    const row1 = rowOf("朝の立上げ");
    expect(within(row1).getByText("4")).not.toBeNull();
    expect(row1.querySelector("span[aria-hidden]")).toHaveProperty(
      "style.backgroundColor",
      "rgb(239, 68, 68)"
    );

    // 0件のバンドルも「0」を出す（値が確定しているので薄色表記は使わない）
    const row2 = rowOf("週末の整理");
    expect(within(row2).getByText("0")).not.toBeNull();
  });

  it("初期選択は有効なバンドルの先頭で、その名前・色を右ペインのヘッダに出す（§3.1）", () => {
    renderBoard();

    expect(within(rightPaneHeader()).getByRole("button", { name: "朝の立上げ" })).not.toBeNull();
    expect(within(rightPaneHeader()).getByRole("button", { name: "色を変更（現在: 赤）" })).not.toBeNull();
  });

  it("左ペインの行をクリックするとそのバンドルが右ペインのヘッダに出る", () => {
    renderBoard();

    clickWithoutServer(within(rowOf("週末の整理")).getByRole("button", { name: "週末の整理" }));

    expect(screen.getByRole("button", { name: "色を変更（現在: 青）" })).not.toBeNull();
  });

  it("バンドル0件のとき右ペインに「バンドルがありません」を出す（§3.2）", () => {
    renderBoard({ active: [] });

    expect(screen.getByText("バンドルがありません")).not.toBeNull();
  });

  describe("新規作成（O-1）", () => {
    it("名前と色を入れて作成でき、作成したバンドルが選択される", async () => {
      vi.mocked(createBundleAction).mockResolvedValue({ ok: true, id: 3 });
      renderBoard({
        active: [...ACTIVE, bundle(3, "夜のまとめ", GRAY)],
        memberCounts: { 1: 4, 2: 0, 3: 0 },
      });
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));
      clickWithoutServer(screen.getByRole("button", { name: "色を選択（現在: 赤）" }));
      clickWithoutServer(screen.getByRole("button", { name: "色 グレー" }));
      fireEvent.change(screen.getByPlaceholderText("バンドル名"), {
        target: { value: "夜のまとめ" },
      });

      await click(screen.getByRole("button", { name: "保存" }));

      expect(createBundleAction).toHaveBeenCalledExactlyOnceWith({
        name: "夜のまとめ",
        color: GRAY,
      });
      // 新規行が閉じ、選択が作成した id（3。この fixture では色がグレーの唯一のバンドル）へ移る
      expect(screen.queryByPlaceholderText("バンドル名")).toBeNull();
      expect(screen.getByRole("button", { name: "色を変更（現在: グレー）" })).not.toBeNull();
    });

    it("名前が空のまま確定しようとすると保存しない（§6）", async () => {
      vi.mocked(createBundleAction).mockResolvedValue({
        ok: false,
        message: "名前を入力してください",
      });
      renderBoard();
      clickWithoutServer(screen.getByRole("button", { name: "新規追加" }));

      await click(screen.getByRole("button", { name: "保存" }));

      expect(createBundleAction).toHaveBeenCalledExactlyOnceWith({ name: "", color: RED });
      expect(screen.getByText("名前を入力してください")).not.toBeNull();
      // 保存されない＝新規行を残す（00_共通 §2.3「失敗時」）
      expect(screen.getByPlaceholderText("バンドル名")).not.toBeNull();
    });
  });

  describe("アーカイブと物理削除（O-3 / §5）", () => {
    it("ヘッダの「アーカイブ」で選択中のバンドルをアーカイブする（物理削除はしない）", async () => {
      renderBoard();

      await click(screen.getByRole("button", { name: "アーカイブ" }));

      expect(setBundleArchivedAction).toHaveBeenCalledExactlyOnceWith(1, true);
      expect(deleteBundleAction).not.toHaveBeenCalled();
    });

    it("アーカイブ済みは折りたたみの中にあり、参照0件の行にだけ「削除」が出る", async () => {
      renderBoard({
        archived: [bundle(8, "旧バンドルA", RED, true), bundle(9, "旧バンドルB", GRAY, true)],
        deletableIds: [9],
      });

      expect(screen.getByText("アーカイブ済み（2）")).not.toBeNull();
      expect(within(rowOf("旧バンドルA")).queryByRole("button", { name: "削除" })).toBeNull();
      const row = rowOf("旧バンドルB");
      clickWithoutServer(within(row).getByRole("button", { name: "削除" }));
      await click(within(row).getByRole("button", { name: "削除する" }));

      expect(deleteBundleAction).toHaveBeenCalledExactlyOnceWith(9);
    });
  });

  describe("名前・色の編集（O-2）", () => {
    it("ヘッダの名前をその場編集し、フォーカスが外れると保存する（色は現在値のまま送る）", async () => {
      renderBoard();
      clickWithoutServer(within(rightPaneHeader()).getByRole("button", { name: "朝の立上げ" }));
      const input = screen.getByDisplayValue("朝の立上げ");

      fireEvent.change(input, { target: { value: "朝の準備" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(updateBundleAction).toHaveBeenCalledExactlyOnceWith(1, {
          name: "朝の準備",
          color: RED,
        });
      });
    });

    it("ヘッダのカラーバーでプリセットから選ぶと即保存する（名前は現在値のまま送る）", async () => {
      renderBoard();
      clickWithoutServer(screen.getByRole("button", { name: "色を変更（現在: 赤）" }));

      await click(screen.getByRole("button", { name: "色 青" }));

      expect(updateBundleAction).toHaveBeenCalledExactlyOnceWith(1, {
        name: "朝の立上げ",
        color: BLUE,
      });
    });
  });
});
