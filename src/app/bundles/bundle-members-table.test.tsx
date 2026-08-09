import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import { routine } from "@/domain/routine/testing/routine";
import { COLOR_PRESETS } from "@/domain/shared/color-presets";
import { BUNDLE_MEMBER_MESSAGES } from "@/app/_lib/error-messages";

import { deferredAction } from "@/app/_testing/actions";
import { hasClass } from "@/app/_testing/dom";
import { click, clickWithoutServer } from "@/app/_testing/interactions";

// bundles-board.tsx と同じ境界（Server Action は使い回さない偽物へ差し替える。
// テスト戦略定義書 §2「偽物を置いてよい境界」）
vi.mock("./actions", () => ({
  setRoutineBundleAction: vi.fn(),
  removeRoutineFromBundleAction: vi.fn(),
  setRoutineScheduledStartTimeAction: vi.fn(),
}));

import {
  removeRoutineFromBundleAction,
  setRoutineBundleAction,
  setRoutineScheduledStartTimeAction,
} from "./actions";
import { BundleMembersTable } from "./bundle-members-table";

const BUNDLE: Bundle = { id: 1, name: "朝の立上げ", color: "#ef4444", isArchived: false };

// この表だけの最小のモード雛形（画面をまたぐ雛形は使わない。table-helpers.ts と同じ流儀）
const MODES: readonly Mode[] = [{ id: 1, name: "モードA", color: COLOR_PRESETS[0].value, isArchived: false }];

function renderTable(routines: Parameters<typeof BundleMembersTable>[0]["routines"]) {
  return render(<BundleMembersTable bundle={BUNDLE} routines={routines} modes={MODES} />);
}

function rows(container: HTMLElement): HTMLTableRowElement[] {
  return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
}

function names(container: HTMLElement): (string | null)[] {
  return rows(container).map((row) => row.cells[0].textContent);
}

/** 開始想定時刻のセルを開いて値を打ち、Enter で確定する（O-7の一連の操作） */
function editStartTime(current: string, next: string) {
  clickWithoutServer(screen.getByRole("button", { name: current }));
  const input = screen.getByDisplayValue(current);
  fireEvent.change(input, { target: { value: next } });
  fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
  vi.mocked(setRoutineBundleAction).mockResolvedValue({ ok: true });
  vi.mocked(removeRoutineFromBundleAction).mockResolvedValue({ ok: true });
  vi.mocked(setRoutineScheduledStartTimeAction).mockResolvedValue({ ok: true });
});

describe("BundleMembersTable（画面定義書05 §3.2: メンバー表の並び・表記）", () => {
  it("メンバーを開始想定時刻の昇順に並べる（同時刻は名前の自然順）", () => {
    const { container } = renderTable([
      routine({ id: 1, name: "わ", bundleId: 1, scheduledStartTime: "07:00" }),
      routine({ id: 2, name: "朝食", bundleId: 1, scheduledStartTime: "06:30" }),
      routine({ id: 3, name: "あ", bundleId: 1, scheduledStartTime: "07:00" }),
    ]);

    expect(names(container)).toEqual(["朝食", "あ", "わ"]);
  });

  it("無効ルーチンの行をグレーアウトする", () => {
    const { container } = renderTable([routine({ id: 1, bundleId: 1, isActive: false })]);

    expect(hasClass(rows(container)[0], "text-ink-faint")).toBe(true);
  });

  it("各列に対応する値を出す（モード・繰り返し・見積・開始想定）", () => {
    const { container } = renderTable([
      routine({
        id: 1,
        name: "朝食",
        bundleId: 1,
        modeId: 1,
        estimateMinutes: 20,
        scheduledStartTime: "06:30",
        recurrenceType: "daily",
      }),
    ]);

    const cells = rows(container)[0].cells;
    expect(cells[0].textContent).toBe("朝食");
    expect(cells[1].textContent).toBe("モードA");
    expect(cells[2].textContent).toBe("毎日");
    expect(cells[3].textContent).toBe("0:20");
    expect(cells[4].textContent).toBe("06:30");
  });

  it("モード未設定は共通 §2.4 の表記にする（薄色の `-`）", () => {
    renderTable([routine({ id: 1, bundleId: 1, modeId: null })]);

    const cell = screen.getByText("-");
    expect(hasClass(cell, "text-ink-faint")).toBe(true);
  });

  it("メンバー0件なら案内と追加ボタンだけを出す", () => {
    const { container } = renderTable([]);

    expect(screen.getByText("まだルーチンが入っていません")).not.toBeNull();
    expect(rows(container)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "＋ ルーチンを追加" })).not.toBeNull();
  });
});

describe("BundleMembersTable（画面定義書05 §4 O-5: メンバーの追加）", () => {
  it("追加の候補は未所属ルーチンだけ", () => {
    renderTable([
      routine({ id: 1, name: "候補A", bundleId: null }),
      routine({ id: 2, name: "候補B", bundleId: null }),
      routine({ id: 3, name: "他バンドル", bundleId: 9 }),
    ]);

    clickWithoutServer(screen.getByRole("button", { name: "＋ ルーチンを追加" }));

    expect(screen.queryByText("候補A")).not.toBeNull();
    expect(screen.queryByText("候補B")).not.toBeNull();
    expect(screen.queryByText("他バンドル")).toBeNull();
  });

  it("候補が1件も無ければ案内を出す", () => {
    renderTable([routine({ id: 1, bundleId: 9 })]);

    clickWithoutServer(screen.getByRole("button", { name: "＋ ルーチンを追加" }));

    expect(screen.getByText("追加できるルーチンがありません。")).not.toBeNull();
  });

  it("候補を開始想定時刻の昇順に並べる", () => {
    renderTable([
      routine({ id: 1, name: "い", bundleId: null, scheduledStartTime: "10:00" }),
      routine({ id: 2, name: "あ", bundleId: null, scheduledStartTime: "08:00" }),
      routine({ id: 3, name: "う", bundleId: null, scheduledStartTime: "09:00" }),
    ]);

    clickWithoutServer(screen.getByRole("button", { name: "＋ ルーチンを追加" }));

    const items = screen.getAllByRole("button", { name: /^(あ|い|う)/ });
    expect(items.map((el) => el.textContent)).toEqual(["あ08:00", "う09:00", "い10:00"]);
  });

  it("候補を選ぶと追加のアクションを呼ぶ", async () => {
    renderTable([routine({ id: 5, name: "候補", bundleId: null })]);

    clickWithoutServer(screen.getByRole("button", { name: "＋ ルーチンを追加" }));
    await click(screen.getByRole("button", { name: /^候補/ }));

    expect(setRoutineBundleAction).toHaveBeenCalledExactlyOnceWith(5, 1);
  });

  it("追加に成功すると候補一覧を閉じる", async () => {
    renderTable([routine({ id: 5, name: "候補", bundleId: null })]);

    clickWithoutServer(screen.getByRole("button", { name: "＋ ルーチンを追加" }));
    await click(screen.getByRole("button", { name: /^候補/ }));

    expect(screen.queryByText("候補")).toBeNull();
  });

  it("追加が失敗したらエラーを帯で出す（別タブでの操作。§6）", async () => {
    vi.mocked(setRoutineBundleAction).mockResolvedValue({
      ok: false,
      message: BUNDLE_MEMBER_MESSAGES.already_in_bundle,
    });
    renderTable([routine({ id: 5, name: "候補", bundleId: null })]);

    clickWithoutServer(screen.getByRole("button", { name: "＋ ルーチンを追加" }));
    await click(screen.getByRole("button", { name: /^候補/ }));

    expect(screen.getByText(BUNDLE_MEMBER_MESSAGES.already_in_bundle)).not.toBeNull();
  });
});

describe("BundleMembersTable（画面定義書05 §4 O-6: メンバーを外す）", () => {
  it("「外す」でバンドルから外す", async () => {
    renderTable([routine({ id: 7, bundleId: 1 })]);

    await click(screen.getByRole("button", { name: "外す" }));

    expect(removeRoutineFromBundleAction).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("外すのに失敗したらエラーを帯で出す（すでに削除されていた等。§6）", async () => {
    vi.mocked(removeRoutineFromBundleAction).mockResolvedValue({
      ok: false,
      message: BUNDLE_MEMBER_MESSAGES.not_found,
    });
    renderTable([routine({ id: 7, bundleId: 1 })]);

    await click(screen.getByRole("button", { name: "外す" }));

    expect(screen.getByText(BUNDLE_MEMBER_MESSAGES.not_found)).not.toBeNull();
  });
});

describe("BundleMembersTable（画面定義書05 §4 O-7・§6: 開始想定時刻の編集）", () => {
  it("区切り文字なしの入力を受け付ける（UI 層で正規化してから送る）", async () => {
    renderTable([routine({ id: 7, bundleId: 1, scheduledStartTime: "06:30" })]);

    editStartTime("06:30", "0805");

    await waitFor(() => {
      expect(setRoutineScheduledStartTimeAction).toHaveBeenCalledExactlyOnceWith(7, "08:05");
    });
  });

  it("確定に成功するとセルが表示に戻る", async () => {
    renderTable([routine({ id: 7, bundleId: 1, scheduledStartTime: "06:30" })]);

    editStartTime("06:30", "0805");

    await waitFor(() => {
      expect(screen.queryByDisplayValue("0805")).toBeNull();
    });
  });

  it("書式が不正ならエラーを出して確定しない（サーバの invalid_start_time を経由）", async () => {
    vi.mocked(setRoutineScheduledStartTimeAction).mockResolvedValue({
      ok: false,
      message: BUNDLE_MEMBER_MESSAGES.invalid_start_time,
    });
    renderTable([routine({ id: 7, bundleId: 1, scheduledStartTime: "06:30" })]);

    editStartTime("06:30", "99:99");

    await waitFor(() => {
      expect(screen.getByText(BUNDLE_MEMBER_MESSAGES.invalid_start_time)).not.toBeNull();
    });
    // 確定していない＝セルは編集中のまま（入力欄が残る）
    expect(screen.queryByDisplayValue("99:99")).not.toBeNull();
  });

  // 解釈できない入力は空文字で渡し、サーバの検証に確実に invalid_start_time を返させる——
  // 生の文字列をそのまま渡すと `09:05x` のような余剰入力がサーバの `normalizeStartTime`
  // （先頭5文字の切り出し）で `09:05` として黙って通ってしまう
  it("解釈できない入力（余剰つき）は空文字で送る", async () => {
    renderTable([routine({ id: 7, bundleId: 1, scheduledStartTime: "06:30" })]);

    editStartTime("06:30", "09:05x");

    await waitFor(() => {
      expect(setRoutineScheduledStartTimeAction).toHaveBeenCalledExactlyOnceWith(7, "");
    });
  });

  it("Esc で取消し、確定を依頼しない（00_共通 §2.3）", () => {
    renderTable([routine({ id: 7, bundleId: 1, scheduledStartTime: "06:30" })]);

    clickWithoutServer(screen.getByRole("button", { name: "06:30" }));
    const input = screen.getByDisplayValue("06:30");
    fireEvent.change(input, { target: { value: "0805" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByDisplayValue("0805")).toBeNull();
    expect(setRoutineScheduledStartTimeAction).not.toHaveBeenCalled();
  });

  it("保存中は「外す」「追加」「開始想定の編集」を押せない（00_共通 §2.3「保存中」）", async () => {
    const pending = deferredAction();
    vi.mocked(removeRoutineFromBundleAction).mockReturnValue(pending.promise);
    renderTable([
      routine({ id: 7, bundleId: 1, scheduledStartTime: "06:30" }),
      routine({ id: 8, name: "候補", bundleId: null, scheduledStartTime: "07:00" }),
    ]);

    await click(screen.getByRole("button", { name: "外す" }));

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "外す" }).disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "＋ ルーチンを追加" }).disabled
    ).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "06:30" }).disabled).toBe(true);

    fireEvent.click(screen.getByRole<HTMLButtonElement>("button", { name: "＋ ルーチンを追加" }));
    // 保存中に押しても候補一覧は開かない
    expect(screen.queryByText("候補")).toBeNull();

    await act(async () => {
      pending.resolve({ ok: true });
    });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "外す" }).disabled).toBe(false);
  });
});

describe("BundleMembersTable（画面定義書05 §4 O-8: ルーチン管理への導線）", () => {
  it("メンバー名がルーチン管理へのリンクになっている", () => {
    renderTable([routine({ id: 7, name: "点検", bundleId: 1 })]);

    const link = screen.getByRole("link", { name: "点検" });
    expect(link.getAttribute("href")).toBe("/routines?edit=7");
  });
});
