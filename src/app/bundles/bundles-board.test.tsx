import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Bundle, BundleId } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import type { Routine } from "@/domain/routine/routine";
import { routine } from "@/domain/routine/testing/routine";
import { COLOR_BY_NAME } from "@/domain/shared/color-presets";
import type { BundleListView } from "@/usecases/bundle/bundle-usecases";

import { BUNDLE_MEMBER_MESSAGES } from "@/app/_lib/error-messages";
import { deferredAction } from "@/app/_testing/actions";
import { hasClass, rgbOf } from "@/app/_testing/dom";
import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { rowOf } from "@/app/_testing/table";

// Server Action の先は実DB接続と revalidatePath に届くため、同じ返り値の契約
// （ActionResult）を返す偽物へ差し替える（テスト戦略定義書 §2「偽物を置いてよい境界」）。
// メンバー表（BundleMembersTable）専用の2本もここで一括して偽物にする——このファイルは
// 左ペイン・ヘッダの検査に閉じ、メンバー表そのものは bundle-members-table.test.tsx が持つ
vi.mock("./actions", () => ({
  createBundleAction: vi.fn(),
  updateBundleAction: vi.fn(),
  setBundleArchivedAction: vi.fn(),
  deleteBundleAction: vi.fn(),
  setRoutineBundleAction: vi.fn(),
  removeRoutineFromBundleAction: vi.fn(),
}));

import {
  createBundleAction,
  deleteBundleAction,
  removeRoutineFromBundleAction,
  setBundleArchivedAction,
  updateBundleAction,
} from "./actions";
import { BundlesBoard } from "./bundles-board";

// プリセット13色のうちテストで使う3つ（画面定義書03 §3.2 の表。モードとバンドルで共有する）
const RED = COLOR_BY_NAME["赤"];
const BLUE = COLOR_BY_NAME["青"];
const GRAY = COLOR_BY_NAME["グレー"];

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

/**
 * エラー帯が出た場所（発生源による出し分け。00_共通 §4.1）。左ペイン・ヘッダの帯は
 * `TableFrame` が描く `<section>` の中に、メンバー表の帯は右ペイン（section の外）に出る
 */
function errorPaneOf(message: string): "board" | "members" {
  return screen.getByText(message).closest("section") === null ? "members" : "board";
}

function renderBoard(
  props: Partial<{
    active: readonly Bundle[];
    archived: readonly Bundle[];
    deletableIds: readonly BundleId[];
    memberCounts: Readonly<Record<BundleId, number>>;
    routines: readonly Routine[];
    modes: readonly Mode[];
  }> = {}
) {
  const bundles: BundleListView = {
    active: props.active ?? ACTIVE,
    archived: props.archived ?? [],
    deletableIds: props.deletableIds ?? [],
    // 0件のバンドルの id は `listBundles` が省略する（Port の契約）ので、既定でも id:2 を入れない
    memberCounts: props.memberCounts ?? { 1: 4 },
  };
  return render(
    <BundlesBoard bundles={bundles} routines={props.routines ?? []} modes={props.modes ?? []} />
  );
}

beforeEach(() => {
  vi.mocked(createBundleAction).mockResolvedValue({ ok: true, id: 99 });
  vi.mocked(updateBundleAction).mockResolvedValue({ ok: true });
  vi.mocked(setBundleArchivedAction).mockResolvedValue({ ok: true });
  vi.mocked(deleteBundleAction).mockResolvedValue({ ok: true });
  vi.mocked(removeRoutineFromBundleAction).mockResolvedValue({ ok: true });
});

describe("BundlesBoard（画面定義書05: 左ペインの一覧・作成・アーカイブ・削除／右ペインのヘッダ）", () => {
  it("有効なバンドルを渡された順に並べ、色の四角と件数を出す（§3.1）", () => {
    renderBoard();

    const row1 = rowOf("朝の立上げ");
    expect(within(row1).getByText("4")).not.toBeNull();
    expect(row1.querySelector("span[aria-hidden]")).toHaveProperty(
      "style.backgroundColor",
      rgbOf(RED)
    );

    // 件数が省略された（＝0件の）バンドルも「0」を出す（値が確定しているので薄色表記は使わない）
    const row2 = rowOf("週末の整理");
    expect(within(row2).getByText("0")).not.toBeNull();
  });

  it("選択中の行を地色で示す（§3.1）", () => {
    renderBoard();

    expect(hasClass(rowOf("朝の立上げ"), "bg-accent-weak")).toBe(true);
    expect(hasClass(rowOf("週末の整理"), "bg-accent-weak")).toBe(false);

    clickWithoutServer(within(rowOf("週末の整理")).getByRole("button", { name: "週末の整理" }));

    expect(hasClass(rowOf("週末の整理"), "bg-accent-weak")).toBe(true);
    expect(hasClass(rowOf("朝の立上げ"), "bg-accent-weak")).toBe(false);
  });

  // **名前以外の場所を押す**——名前ボタンを押すテストは、選択が `<tr>` にあってもボタンだけに
  // あってもバブリングで通ってしまい、当たり判定の広さを区別できない
  it("色見本や件数を押しても選択が移る（§3.1: 選択の当たり判定は行全体）", () => {
    renderBoard();

    // 件数（名前の右端）
    clickWithoutServer(within(rowOf("週末の整理")).getByText("0"));
    expect(hasClass(rowOf("週末の整理"), "bg-accent-weak")).toBe(true);

    // 色見本のセル（色見本自身は装飾として読み上げから外してあるのでセルを押す）
    clickWithoutServer(within(rowOf("朝の立上げ")).getAllByRole("cell")[0]);
    expect(hasClass(rowOf("朝の立上げ"), "bg-accent-weak")).toBe(true);
    expect(hasClass(rowOf("週末の整理"), "bg-accent-weak")).toBe(false);
  });

  // 他の管理画面（S-02 / S-03）の見出し行にある説明文を、この画面は持たない
  it("見出し行に説明文を置かず「＋ 新規追加」だけを出す（§2）", () => {
    const { container } = renderBoard();

    const boardPane = container.querySelector("section");
    expect(boardPane).not.toBeNull();
    expect(boardPane?.querySelectorAll("p")).toHaveLength(0);
    expect(within(boardPane as HTMLElement).getByRole("button", { name: "新規追加" })).not.toBeNull();
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

  // BundleMembersTable への配線（bundle を取り違えていないか）。全ルーチンを渡し、選択中の
  // バンドルのメンバーだけが表に出ることを見る（画面定義書05 §3.2）
  it("左ペインでバンドルを切り替えると、そのバンドルのメンバーだけがメンバー表に出る", () => {
    renderBoard({
      routines: [
        routine({ id: 101, name: "朝食", bundleId: 1 }),
        routine({ id: 102, name: "週次レビュー", bundleId: 2 }),
      ],
    });

    expect(screen.getByText("朝食")).not.toBeNull();
    expect(screen.queryByText("週次レビュー")).toBeNull();

    clickWithoutServer(within(rowOf("週末の整理")).getByRole("button", { name: "週末の整理" }));

    expect(screen.getByText("週次レビュー")).not.toBeNull();
    expect(screen.queryByText("朝食")).toBeNull();
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

    it("アーカイブ済みの「復元」で有効へ戻す", async () => {
      renderBoard({ archived: [bundle(8, "旧バンドルA", RED, true)] });

      await click(within(rowOf("旧バンドルA")).getByRole("button", { name: "復元" }));

      expect(setBundleArchivedAction).toHaveBeenCalledExactlyOnceWith(8, false);
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

    it("Esc で編集を取り消し、保存を依頼しない（00_共通 §2.3）", () => {
      renderBoard();
      clickWithoutServer(within(rightPaneHeader()).getByRole("button", { name: "朝の立上げ" }));
      const input = screen.getByDisplayValue("朝の立上げ");

      fireEvent.change(input, { target: { value: "朝の準備" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(screen.queryByDisplayValue("朝の準備")).toBeNull();
      expect(updateBundleAction).not.toHaveBeenCalled();
    });
  });

  // 保存境界（isPending/run）を画面全体で共有していること（00_共通 §4.2「再発火の抑止」——
  // 対象の行が違っても確定を待つ操作をすべて受け付けない）。左ペイン・ヘッダとメンバー表が
  // それぞれ独立した境界を持っていた場合はどちらも green のまま通ってしまうテストなので、
  // 「押せない」ことを直接見る
  describe("保存境界の共有（00_共通 §4.2）", () => {
    it("メンバー表の操作が保留中は、左ペインの「新規追加」も押せない", async () => {
      const pending = deferredAction();
      vi.mocked(removeRoutineFromBundleAction).mockReturnValue(pending.promise);
      renderBoard({ routines: [routine({ id: 101, name: "朝食", bundleId: 1 })] });

      await click(screen.getByRole("button", { name: "外す" }));

      expect(screen.getByRole<HTMLButtonElement>("button", { name: "新規追加" }).disabled).toBe(
        true
      );

      await act(async () => {
        pending.resolve({ ok: true });
      });
    });

    it("左ペイン・ヘッダの操作が保留中は、メンバー表の「外す」も押せない", async () => {
      const pending = deferredAction();
      vi.mocked(setBundleArchivedAction).mockReturnValue(pending.promise);
      renderBoard({ routines: [routine({ id: 101, name: "朝食", bundleId: 1 })] });

      await click(screen.getByRole("button", { name: "アーカイブ" }));

      expect(screen.getByRole<HTMLButtonElement>("button", { name: "外す" }).disabled).toBe(true);

      await act(async () => {
        pending.resolve({ ok: true });
      });
    });

    // 画面の操作によるクリアは自分の scope のときだけ効かせる。無条件にクリアすると、
    // 他方のペインを触るだけ（サーバへは何も送らない操作）で未解決のエラーが消えてしまう
    // （00_共通 §4.1「失敗はすべて画面に出す」に反する）
    it("左ペインにエラーが出ている間、メンバー表の操作（サーバへ送らないもの）を触ってもエラーは消えない", async () => {
      vi.mocked(setBundleArchivedAction).mockResolvedValue({ ok: false, message: "左の失敗" });
      renderBoard({ routines: [routine({ id: 101, name: "朝食", bundleId: 1 })] });

      await click(screen.getByRole("button", { name: "アーカイブ" }));
      expect(screen.getByText("左の失敗")).not.toBeNull();

      // メンバー表側のローカルな UI 操作（候補一覧を開くだけ。Server Action は呼ばない）
      clickWithoutServer(screen.getByRole("button", { name: "＋ ルーチンを追加" }));

      expect(screen.getByText("左の失敗")).not.toBeNull();
    });

    it("メンバー表にエラーが出ている間、ヘッダの操作（サーバへ送らないもの）を触ってもエラーは消えない", async () => {
      vi.mocked(removeRoutineFromBundleAction).mockResolvedValue({
        ok: false,
        message: "メンバー表の失敗",
      });
      renderBoard({ routines: [routine({ id: 101, name: "朝食", bundleId: 1 })] });

      await click(screen.getByRole("button", { name: "外す" }));
      expect(screen.getByText("メンバー表の失敗")).not.toBeNull();

      // ヘッダ側のローカルな UI 操作（名前のインライン編集を開くだけ。Server Action は呼ばない）
      clickWithoutServer(within(rightPaneHeader()).getByRole("button", { name: "朝の立上げ" }));

      expect(screen.getByText("メンバー表の失敗")).not.toBeNull();
    });

    // 上2本（他方の scope なら消えない）と対にして初めて scope の判定が固定される。
    // 左ペインだけを見ていると、メンバー表側のクリアが scope を無視していても気づけない
    it("左ペイン・ヘッダのエラーは、そのペインで新しい編集を始めると消える", async () => {
      vi.mocked(setBundleArchivedAction).mockResolvedValue({ ok: false, message: "左の失敗" });
      renderBoard();
      await click(screen.getByRole("button", { name: "アーカイブ" }));
      expect(screen.getByText("左の失敗")).not.toBeNull();

      clickWithoutServer(within(rightPaneHeader()).getByRole("button", { name: "朝の立上げ" }));

      expect(screen.queryByText("左の失敗")).toBeNull();
    });

    it("メンバー表のエラーは、メンバー表で新しい操作を始めると消える", async () => {
      vi.mocked(removeRoutineFromBundleAction).mockResolvedValue({
        ok: false,
        message: "メンバー表の失敗",
      });
      renderBoard({ routines: [routine({ id: 101, name: "朝食", bundleId: 1 })] });
      await click(screen.getByRole("button", { name: "外す" }));
      expect(screen.getByText("メンバー表の失敗")).not.toBeNull();

      clickWithoutServer(screen.getByRole("button", { name: "＋ ルーチンを追加" }));

      expect(screen.queryByText("メンバー表の失敗")).toBeNull();
    });
  });

  // 発生源による帯の出し分け（00_共通 §4.1）。メンバー表が出す失敗もサーバからの応答であり、
  // bundles-board を通って表示先が決まる
  describe("エラー帯の出し分け（00_共通 §4.1）", () => {
    it("メンバー表の失敗はメンバー表の帯に出る", async () => {
      vi.mocked(removeRoutineFromBundleAction).mockResolvedValue({
        ok: false,
        message: BUNDLE_MEMBER_MESSAGES.not_found,
      });
      renderBoard({
        routines: [routine({ id: 101, name: "朝食", bundleId: 1 })],
      });

      await click(screen.getByRole("button", { name: "外す" }));

      expect(errorPaneOf(BUNDLE_MEMBER_MESSAGES.not_found)).toBe("members");
    });

    it("左ペインの失敗は左ペインの帯に出る", async () => {
      vi.mocked(setBundleArchivedAction).mockResolvedValue({ ok: false, message: "左の失敗" });
      renderBoard();

      await click(screen.getByRole("button", { name: "アーカイブ" }));

      expect(errorPaneOf("左の失敗")).toBe("board");
    });
  });
});
