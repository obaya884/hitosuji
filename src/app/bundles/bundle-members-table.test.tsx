import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import type { Routine } from "@/domain/routine/routine";
import { routine } from "@/domain/routine/testing/routine";
import { COLOR_PRESETS } from "@/domain/shared/color-presets";
import { BUNDLE_MEMBER_MESSAGES } from "@/app/_lib/error-messages";
import { useServerActionRunner } from "@/app/_lib/use-server-action";

import { deferredAction } from "@/app/_testing/actions";
import { hasClass } from "@/app/_testing/dom";
import { click, clickWithoutServer } from "@/app/_testing/interactions";

// bundles-board.tsx と同じ境界（Server Action は使い回さない偽物へ差し替える。
// テスト戦略定義書 §2「偽物を置いてよい境界」）
vi.mock("./actions", () => ({
  setRoutineBundleAction: vi.fn(),
  removeRoutineFromBundleAction: vi.fn(),
}));

import { removeRoutineFromBundleAction, setRoutineBundleAction } from "./actions";
import { BundleMembersTable } from "./bundle-members-table";

const BUNDLE: Bundle = { id: 1, name: "朝の立上げ", color: "#ef4444", isArchived: false };

// この表だけの最小のモード雛形（画面をまたぐ雛形は使わない。table-helpers.ts と同じ流儀）
const MODES: readonly Mode[] = [{ id: 1, name: "モードA", color: COLOR_PRESETS[0].value, isArchived: false }];

// BundleMembersTable は保存境界（isPending/run/error/setError）を持たず bundles-board.tsx から
// props で受け取る（画面全体で1つの境界を共有するため。00_共通 §4.2）。ここでは本番と同じ
// `useServerActionRunner` へエラーの置き場を渡して配線する。**発生源による表示先の振り分け
// （scope）は持たない**——この表しか描かないので分岐が起きず、振り分けそのものの検査は
// bundles-board.test.tsx が持つ
function Harness({ routines }: Readonly<{ routines: readonly Routine[] }>) {
  const [error, setError] = useState<string | null>(null);
  const { isPending, run } = useServerActionRunner(setError);
  return (
    <BundleMembersTable
      bundle={BUNDLE}
      routines={routines}
      modes={MODES}
      error={error}
      setError={setError}
      isPending={isPending}
      run={run}
    />
  );
}

function renderTable(routines: readonly Routine[]) {
  return render(<Harness routines={routines} />);
}

function rows(container: HTMLElement): HTMLTableRowElement[] {
  return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
}

function names(container: HTMLElement): (string | null)[] {
  return rows(container).map((row) => row.cells[0].textContent);
}

beforeEach(() => {
  vi.mocked(setRoutineBundleAction).mockResolvedValue({ ok: true });
  vi.mocked(removeRoutineFromBundleAction).mockResolvedValue({ ok: true });
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

  it("無効ルーチンの行をグレーアウトする（名前セルも含めて実効的に薄くなる）", () => {
    const { container } = renderTable([
      routine({ id: 1, name: "点検", bundleId: 1, isActive: false }),
    ]);

    expect(hasClass(rows(container)[0], "text-ink-faint")).toBe(true);
    // 名前リンクに固定色クラス（text-accent 等）が付いていると、行の text-ink-faint を
    // 継承で上書きしてしまい、いちばん目立つ列だけグレーアウトが効かなくなる
    const link = screen.getByRole("link", { name: "点検" });
    expect(hasClass(link, "text-accent")).toBe(false);
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

describe("BundleMembersTable（保存中の操作抑止。00_共通 §2.3「保存中」）", () => {
  it("保存中は「外す」「追加」を押せない", async () => {
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

    fireEvent.click(screen.getByRole<HTMLButtonElement>("button", { name: "＋ ルーチンを追加" }));
    // 保存中に押しても候補一覧は開かない
    expect(screen.queryByText("候補")).toBeNull();

    await act(async () => {
      pending.resolve({ ok: true });
    });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "外す" }).disabled).toBe(false);
  });
});

describe("BundleMembersTable（画面定義書05 §4 O-7: ルーチン管理への導線）", () => {
  it("メンバー名がルーチン管理へのリンクになっている", () => {
    renderTable([routine({ id: 7, name: "点検", bundleId: 1 })]);

    const link = screen.getByRole("link", { name: "点検" });
    expect(link.getAttribute("href")).toBe("/routines?edit=7");
  });
});
