import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deferredAction } from "@/app/_testing/actions";
import { hasClass, rgbOf } from "@/app/_testing/dom";
import { MODE_COLORS, type Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Routine } from "@/domain/routine/routine";

import { routine } from "@/domain/routine/testing/routine";
import { MODES, PROJECTS, SECTIONS, TODAY } from "./_testing/fixtures";
import {
  createRoutineAction,
  deleteRoutineAction,
  setRoutineActiveAction,
  updateRoutineAction,
} from "./actions";
import { RoutinesTable } from "./routines-table";

// actions.ts は "use server" で、その先は pg.Pool と revalidatePath に届くため素の jsdom では
// 描画すらできない。同じ返り値の契約（RoutineActionResult）を返す偽物へ差し替える
// （アーキテクチャ定義書 §8「偽物を置いてよい境界」）。目的は呼ばれ方の検証ではなく、
// 成功・失敗を固定して両分岐（フォームを閉じる / エラーを出して開いたまま）を通すこと。
// 返り値の型は vi.mocked() が本物のシグネチャから引くのでここでは注釈しない
vi.mock("./actions", () => ({
  createRoutineAction: vi.fn(),
  updateRoutineAction: vi.fn(),
  setRoutineActiveAction: vi.fn(),
  deleteRoutineAction: vi.fn(),
}));

/** 既定のマスタ・セクションで描画する。差分だけを over で上書きする */
function renderTable(
  routines: readonly Routine[],
  over: Partial<ComponentProps<typeof RoutinesTable>> = {}
) {
  return render(
    <RoutinesTable
      routines={routines}
      modes={MODES}
      projects={PROJECTS}
      allModes={MODES}
      allProjects={PROJECTS}
      sections={SECTIONS}
      today={TODAY}
      {...over}
    />
  );
}

/** 観測点は構造で取る（列は位置で決まる。§3「列は左から …の順」） */
const COL = {
  name: 0,
  mode: 1,
  project: 2,
  estimate: 3,
  recurrence: 4,
  scheduledStart: 5,
  active: 6,
} as const;

function rows(container: HTMLElement): HTMLTableRowElement[] {
  return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
}

function cell(container: HTMLElement, rowIndex: number, col: number): HTMLTableCellElement {
  return rows(container)[rowIndex].cells[col];
}

function names(container: HTMLElement): (string | null)[] {
  return rows(container).map((row) => row.cells[COL.name].textContent);
}

function header(label: string): HTMLTableCellElement {
  return screen.getByRole<HTMLTableCellElement>("columnheader", { name: label });
}

/** startTransition の中で await される Server Action の解決までを流す */
async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

beforeEach(() => {
  // vi.mock の偽物はファイル内で共有されるため、返り値をテストごとに置き直す
  // （呼び出し履歴は setup.ts の afterEach が消す）
  vi.mocked(createRoutineAction).mockResolvedValue({ ok: true });
  vi.mocked(updateRoutineAction).mockResolvedValue({ ok: true });
  vi.mocked(setRoutineActiveAction).mockResolvedValue({ ok: true });
  vi.mocked(deleteRoutineAction).mockResolvedValue({ ok: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RoutinesTable（画面定義書02 §3: 一覧の列と表記）", () => {
  it("列は左から 名前/モード/プロジェクト/見積/繰り返し/開始想定/有効/操作 の順に並べる", () => {
    const { container } = renderTable([routine({ id: 1 })]);

    const labels = [...container.querySelectorAll("thead th")].map((th) =>
      // 並べ替えの印（▲▼）は見出しのラベルではないので落とす
      th.textContent?.replace(/[▲▼]/g, "")
    );
    expect(labels).toEqual([
      "名前",
      "モード",
      "プロジェクト",
      "見積",
      "繰り返し",
      "開始想定",
      "有効",
      "",
    ]);
  });

  it("各列に対応する値を出す（見積は H:MM・開始想定はセクション名を併記）", () => {
    const { container } = renderTable([
      routine({
        id: 1,
        name: "点検",
        estimateMinutes: 20,
        scheduledStartTime: "06:30",
        modeId: 1,
        projectId: 11,
        // 繰り返し列の期待値そのものなので既定に頼らず明示する
        recurrenceType: "daily",
      }),
    ]);

    expect(cell(container, 0, COL.name).textContent).toBe("点検");
    expect(cell(container, 0, COL.mode).textContent).toBe("モードA");
    expect(cell(container, 0, COL.project).textContent).toBe("案件A");
    expect(cell(container, 0, COL.estimate).textContent).toBe("0:20");
    expect(cell(container, 0, COL.recurrence).textContent).toBe("毎日");
    expect(cell(container, 0, COL.scheduledStart).textContent).toBe("06:30(朝)");
  });

  it("モード・プロジェクトが未設定なら薄色の `-` を出す（00_共通 §2.4）", () => {
    const { container } = renderTable([routine({ id: 1, modeId: null, projectId: null })]);

    for (const col of [COL.mode, COL.project]) {
      const target = cell(container, 0, col);
      expect(target.textContent).toBe("-");
      expect(hasClass(target.firstElementChild!, "text-ink-faint")).toBe(true);
    }
  });

  it("参照中であればアーカイブ済みマスタの名前も出す（過去の参照を保つ）", () => {
    const archivedMode: Mode = { id: 9, name: "旧モード", color: MODE_COLORS[12], isArchived: true };
    const archivedProject: Project = { id: 19, name: "旧案件", isArchived: true };
    const { container } = renderTable([routine({ id: 1, modeId: 9, projectId: 19 })], {
      allModes: [...MODES, archivedMode],
      allProjects: [...PROJECTS, archivedProject],
    });

    expect(cell(container, 0, COL.mode).textContent).toBe("旧モード");
    expect(cell(container, 0, COL.project).textContent).toBe("旧案件");
  });

  // 要約の文字列そのものは domain の describeRecurrence が担保済み。
  // ここでは「繰り返し列にその要約が出る」ことを見る
  it("繰り返し列に人間可読の要約を出す（週間隔の接頭・プリセット名・終了日の付記）", () => {
    const { container } = renderTable([
      routine({ id: 1, scheduledStartTime: "01:00", recurrenceType: "daily" }),
      routine({
        id: 2,
        scheduledStartTime: "02:00",
        recurrenceType: "weekly",
        weekdays: 0b0011111,
        weekInterval: 1,
      }),
      routine({
        id: 3,
        scheduledStartTime: "03:00",
        recurrenceType: "weekly",
        weekdays: 0b0000010,
        weekInterval: 2,
      }),
      routine({ id: 4, scheduledStartTime: "04:00", recurrenceType: "monthly", monthDay: 25 }),
      routine({ id: 5, scheduledStartTime: "05:00", recurrenceType: "interval", intervalDays: 3 }),
      routine({ id: 6, scheduledStartTime: "06:00", endDate: "2026-09-30" }),
    ]);

    expect(rows(container).map((row) => row.cells[COL.recurrence].textContent)).toEqual([
      "毎日",
      "週次(平日)",
      "隔週(火)",
      "月次(25日)",
      "3日ごと",
      "毎日 〜2026-09-30",
    ]);
  });

  it("有効セクションが1つも無ければ開始想定は時刻だけを出す", () => {
    const { container } = renderTable([routine({ id: 1, scheduledStartTime: "06:30" })], {
      sections: [],
    });

    expect(cell(container, 0, COL.scheduledStart).textContent).toBe("06:30");
  });

  it("モード色を名前の文字色に反映する（S-01 と同じ表現）", () => {
    const { container } = renderTable([routine({ id: 1, modeId: 2 })]);

    // jsdom は inline style の色を rgb() 表記へ正規化する
    // 添字ではなく id で引く（フィクスチャを並び替えても主張が変わらない）
    expect(cell(container, 0, COL.name).style.color).toBe(
      rgbOf(MODES.find((m) => m.id === 2)!.color)
    );
  });

  it("無効ルーチンは行をグレーアウトし、名前にモード色を付けない", () => {
    const { container } = renderTable([routine({ id: 1, modeId: 2, isActive: false })]);

    expect(hasClass(rows(container)[0], "text-ink-faint")).toBe(true);
    expect(cell(container, 0, COL.name).style.color).toBe("");
  });

  it("ルーチンが0件なら空の案内を出す", () => {
    renderTable([]);

    expect(screen.queryByText("ルーチンはまだありません。")).not.toBeNull();
  });

  it("0件でもフォームを開いている間は空の案内を出さない", async () => {
    renderTable([]);

    await click(screen.getByText("新規ルーチン"));

    expect(screen.queryByText("ルーチンはまだありません。")).toBeNull();
  });
});

describe("RoutinesTable（画面定義書02 §3.1: 列見出しのクリックで並べ替える。F-306）", () => {
  const forSort = [
    routine({ id: 1, name: "い", scheduledStartTime: "10:00", modeId: 2 }),
    routine({ id: 2, name: "あ", scheduledStartTime: "08:00", modeId: null }),
    routine({ id: 3, name: "う", scheduledStartTime: "09:00", modeId: 1 }),
  ];

  it("既定は開始想定の昇順（展開後のデイリーと同じ並び）", () => {
    const { container } = renderTable(forSort);

    expect(names(container)).toEqual(["あ", "う", "い"]);
    expect(header("開始想定").getAttribute("aria-sort")).toBe("ascending");
    expect(header("名前").getAttribute("aria-sort")).toBe("none");
  });

  it("見出しを押すとその軸の昇順になり、もう一度押すと降順になる", () => {
    const { container } = renderTable(forSort);

    fireEvent.click(screen.getByText("名前"));
    expect(names(container)).toEqual(["あ", "い", "う"]);
    expect(header("名前").getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(screen.getByText("名前"));
    expect(names(container)).toEqual(["う", "い", "あ"]);
    expect(header("名前").getAttribute("aria-sort")).toBe("descending");
  });

  it("同じ見出しを3回押すと昇順に戻る（昇順⇄降順のトグル）", () => {
    const { container } = renderTable(forSort);

    fireEvent.click(screen.getByText("名前"));
    fireEvent.click(screen.getByText("名前"));
    fireEvent.click(screen.getByText("名前"));

    expect(header("名前").getAttribute("aria-sort")).toBe("ascending");
    expect(names(container)).toEqual(["あ", "い", "う"]);
  });

  it("別の列に切り替えると昇順から始まる（未設定は昇順・降順のいずれでも末尾）", () => {
    const { container } = renderTable(forSort);

    fireEvent.click(screen.getByText("名前"));
    fireEvent.click(screen.getByText("名前"));
    fireEvent.click(screen.getByText("モード"));

    expect(header("モード").getAttribute("aria-sort")).toBe("ascending");
    expect(header("名前").getAttribute("aria-sort")).toBe("none");
    // モードA(う) → モードB(い) → 未設定(あ)
    expect(names(container)).toEqual(["う", "い", "あ"]);

    fireEvent.click(screen.getByText("モード"));
    expect(names(container)).toEqual(["い", "う", "あ"]);
  });

  it("並べ替えできるのは 名前/モード/プロジェクト/繰り返し/開始想定 の5列だけ（見積は対象外）", () => {
    renderTable(forSort);

    for (const label of ["名前", "モード", "プロジェクト", "繰り返し", "開始想定"]) {
      expect(header(label).querySelector("button")).not.toBeNull();
    }
    expect(header("見積").querySelector("button")).toBeNull();
  });

  // 順序規則そのものは domain/routine/order.test.ts が担保済み。
  // ここでは残る2列（プロジェクト・繰り返し）の見出しがその軸に結線されていることを見る
  it("プロジェクトの見出しは名前順に並べ、未設定を末尾に置く", () => {
    const { container } = renderTable([
      routine({ id: 1, name: "い", scheduledStartTime: "08:00", projectId: null }),
      routine({ id: 2, name: "あ", scheduledStartTime: "09:00", projectId: 12 }), // 案件B
      routine({ id: 3, name: "う", scheduledStartTime: "10:00", projectId: 11 }), // 案件A
    ]);

    fireEvent.click(screen.getByText("プロジェクト"));

    expect(header("プロジェクト").getAttribute("aria-sort")).toBe("ascending");
    expect(names(container)).toEqual(["う", "あ", "い"]);
  });

  it("繰り返しの見出しは頻度の高い順に並べる（毎日 → 週次 → 月次 → n日ごと）", () => {
    const { container } = renderTable([
      routine({ id: 1, name: "い", scheduledStartTime: "08:00", recurrenceType: "monthly", monthDay: 1 }),
      routine({ id: 2, name: "あ", scheduledStartTime: "09:00", recurrenceType: "interval", intervalDays: 3 }),
      routine({ id: 3, name: "う", scheduledStartTime: "10:00", recurrenceType: "daily" }),
      routine({
        id: 4,
        name: "え",
        scheduledStartTime: "11:00",
        recurrenceType: "weekly",
        weekdays: 0b0000001,
        weekInterval: 1,
      }),
    ]);

    fireEvent.click(screen.getByText("繰り返し"));

    expect(header("繰り返し").getAttribute("aria-sort")).toBe("ascending");
    expect(names(container)).toEqual(["う", "え", "い", "あ"]);
  });

  it("選んだ並び順は記憶しない（開き直すと既定の開始想定の昇順に戻る）", () => {
    const first = renderTable(forSort);

    fireEvent.click(screen.getByText("名前"));
    expect(names(first.container)).toEqual(["あ", "い", "う"]);
    first.unmount();

    const second = renderTable(forSort);

    expect(names(second.container)).toEqual(["あ", "う", "い"]);
    expect(header("開始想定").getAttribute("aria-sort")).toBe("ascending");
    expect(header("名前").getAttribute("aria-sort")).toBe("none");
  });

  it("昇順/降順の印は並べ替え中の列にだけ見せる（他の列の印は不可視）", () => {
    renderTable(forSort);
    // 印は見出しボタンの中の装飾（aria-hidden）なので構造で取る
    const mark = (label: string) => header(label).querySelector<HTMLElement>("button > span")!;

    expect(mark("開始想定").textContent).toBe("▲");
    expect(hasClass(mark("開始想定"), "invisible")).toBe(false);
    expect(hasClass(mark("名前"), "invisible")).toBe(true);

    fireEvent.click(screen.getByText("名前"));
    expect(mark("名前").textContent).toBe("▲");
    expect(hasClass(mark("名前"), "invisible")).toBe(false);
    expect(hasClass(mark("開始想定"), "invisible")).toBe(true);

    fireEvent.click(screen.getByText("名前"));
    expect(mark("名前").textContent).toBe("▼");
    expect(hasClass(mark("名前"), "invisible")).toBe(false);
  });
});

describe("RoutinesTable（画面定義書02 §5: 有効/無効・削除・編集。§1 N-01 の対象外）", () => {
  it("有効トグルは即時切替を依頼する（O-3）", async () => {
    const { container } = renderTable([routine({ id: 7, name: "点検", isActive: true })]);

    await click(cell(container, 0, COL.active).querySelector("input")!);

    expect(setRoutineActiveAction).toHaveBeenCalledWith(7, false);
  });

  it("無効のルーチンは有効化を依頼する", async () => {
    const { container } = renderTable([routine({ id: 7, isActive: false })]);

    await click(cell(container, 0, COL.active).querySelector("input")!);

    expect(setRoutineActiveAction).toHaveBeenCalledWith(7, true);
  });

  // §1: この画面は N-01（楽観的更新）の対象外。保存の完了を待って一覧へ反映するため、
  // チェック状態は props（サーバの値）だけで決まり、ローカルに先行反映しない
  it("楽観的更新はしない（成功しても失敗してもチェック状態は props のまま）", async () => {
    vi.mocked(setRoutineActiveAction).mockResolvedValue({ ok: false, message: "保存に失敗しました" });
    const { container } = renderTable([routine({ id: 7, isActive: true })]);

    const checkbox = cell(container, 0, COL.active).querySelector<HTMLInputElement>("input")!;
    await click(checkbox);

    expect(checkbox.checked).toBe(true);
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  // 「編集」だけは保存中も押せる（disabled を付けていない）。是非は FB-63 で検討中のため、
  // ここでは現状を固定するにとどめる
  it("保存中は有効トグルと削除を押せない（編集ボタンは押せる。FB-63 で検討中）", async () => {
    const pending = deferredAction();
    vi.mocked(setRoutineActiveAction).mockReturnValue(pending.promise);
    const { container } = renderTable([routine({ id: 7 })]);
    const checkbox = cell(container, 0, COL.active).querySelector<HTMLInputElement>("input")!;
    const remove = screen.getByText<HTMLButtonElement>("削除");
    const edit = screen.getByText<HTMLButtonElement>("編集");

    await click(checkbox);
    expect(checkbox.disabled).toBe(true);
    expect(remove.disabled).toBe(true);
    expect(edit.disabled).toBe(false);

    await act(async () => {
      pending.resolve({ ok: true });
    });
    expect(checkbox.disabled).toBe(false);
    expect(remove.disabled).toBe(false);
  });

  it("削除は確認ダイアログで取り消せる（O-4）", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderTable([routine({ id: 7 })]);

    await click(screen.getByText("削除"));

    expect(deleteRoutineAction).not.toHaveBeenCalled();
  });

  it("削除は確認のうえ実行し、展開済みタスクが残ることを告げる（O-4 ログ保全）", async () => {
    renderTable([routine({ id: 7, name: "点検" })]);

    await click(screen.getByText("削除"));

    expect(vi.mocked(window.confirm).mock.calls[0][0]).toBe(
      "「点検」を削除しますか？\n展開済みのタスクは残ります。"
    );
    expect(deleteRoutineAction).toHaveBeenCalledWith(7);
  });

  it("削除の失敗はエラーとして知らせる", async () => {
    vi.mocked(deleteRoutineAction).mockResolvedValue({
      ok: false,
      message: "ルーチンが見つかりませんでした",
    });
    renderTable([routine({ id: 7 })]);

    await click(screen.getByText("削除"));

    const notice = screen.getByText("ルーチンが見つかりませんでした");
    expect(hasClass(notice, "text-danger")).toBe(true);
  });
});

describe("RoutinesTable（画面定義書02 §4・§5: 新規/編集フォームの開閉と保存）", () => {
  it("新規ルーチンでフォームを開き、保存が成功すると閉じる（O-1）", async () => {
    renderTable([]);

    await click(screen.getByText("新規ルーチン"));
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "点検" } });
    await click(screen.getByText("保存"));

    expect(vi.mocked(createRoutineAction).mock.calls[0][0]).toMatchObject({
      name: "点検",
      recurrenceType: "daily",
      startDate: TODAY,
    });
    expect(screen.queryByLabelText("名前")).toBeNull();
  });

  it("新規作成が失敗したらフォームを開いたままエラーを出す", async () => {
    vi.mocked(createRoutineAction).mockResolvedValue({
      ok: false,
      message: "名前を入力してください",
    });
    renderTable([]);

    await click(screen.getByText("新規ルーチン"));
    await click(screen.getByText("保存"));

    expect(screen.queryByText("名前を入力してください")).not.toBeNull();
    expect(screen.queryByLabelText("名前")).not.toBeNull();
  });

  it("編集ボタンでその行のフォームを開き、ボタンは「閉じる」になる（O-2）", async () => {
    renderTable([routine({ id: 7, name: "点検" })]);

    await click(screen.getByText("編集"));

    expect(screen.getByLabelText<HTMLInputElement>("名前").value).toBe("点検");
    expect(screen.queryByText("閉じる")).not.toBeNull();
    expect(screen.queryByText("編集")).toBeNull();
  });

  it("「閉じる」でフォームを閉じる", async () => {
    renderTable([routine({ id: 7 })]);

    await click(screen.getByText("編集"));
    await click(screen.getByText("閉じる"));

    expect(screen.queryByLabelText("名前")).toBeNull();
  });

  it("編集の保存はその行の id で更新を依頼し、成功するとフォームを閉じる", async () => {
    renderTable([routine({ id: 7, name: "点検" })]);

    await click(screen.getByText("編集"));
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "点検（改）" } });
    await click(screen.getByText("保存"));

    expect(vi.mocked(updateRoutineAction).mock.calls[0][0]).toBe(7);
    expect(vi.mocked(updateRoutineAction).mock.calls[0][1]).toMatchObject({ name: "点検（改）" });
    expect(screen.queryByLabelText("名前")).toBeNull();
  });

  it("保存が失敗したらフォームを開いたままエラーを出す（入力し直せるようにする）", async () => {
    vi.mocked(updateRoutineAction).mockResolvedValue({
      ok: false,
      message: "見積もりは1分以上の整数で入力してください",
    });
    renderTable([routine({ id: 7, name: "点検" })]);

    await click(screen.getByText("編集"));
    fireEvent.change(screen.getByLabelText("見積もり（分）"), { target: { value: "" } });
    await click(screen.getByText("保存"));

    expect(screen.queryByText("見積もりは1分以上の整数で入力してください")).not.toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("名前").value).toBe("点検");
  });

  it("前の失敗のエラーはフォームを開き直すと消える", async () => {
    vi.mocked(deleteRoutineAction).mockResolvedValue({ ok: false, message: "削除できません" });
    renderTable([routine({ id: 7 })]);

    await click(screen.getByText("削除"));
    expect(screen.queryByText("削除できません")).not.toBeNull();

    await click(screen.getByText("編集"));

    expect(screen.queryByText("削除できません")).toBeNull();
  });

  it("編集フォームの取消では保存を依頼しない", async () => {
    renderTable([routine({ id: 7 })]);

    await click(screen.getByText("編集"));
    await click(screen.getByText("取消"));

    expect(updateRoutineAction).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("名前")).toBeNull();
  });

  it("新規フォームの取消では作成を依頼しない", async () => {
    renderTable([]);

    await click(screen.getByText("新規ルーチン"));
    await click(screen.getByText("取消"));

    expect(createRoutineAction).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("名前")).toBeNull();
    expect(screen.queryByText("ルーチンはまだありません。")).not.toBeNull();
  });
});
