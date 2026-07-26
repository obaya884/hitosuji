import { fireEvent, render, screen } from "@testing-library/react";
import type { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MODE_COLORS, type Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Task } from "@/domain/task/task";
import type { DailyReviewView } from "@/usecases/review/review-usecases";

import { ReviewBoard } from "./review-board";

// next/navigation はアプリのルータ文脈の外では動かないため、本物と同じ契約
// （useRouter の返り値＝AppRouterInstance）を返す偽物へ差し替える
// （アーキテクチャ定義書 §8「偽物を置いてよい境界」）。過不足は useRouter の
// 戻り値注釈が検査するので、各メソッドは素の vi.fn() でよい
const { router } = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: (): ReturnType<typeof useRouter> => router,
}));

const DATE = "2026-07-20"; // 月曜
const MODES: readonly Mode[] = [
  { id: 1, name: "モードA", color: MODE_COLORS[0], isArchived: false },
  { id: 2, name: "モードB", color: MODE_COLORS[1], isArchived: false },
  { id: 9, name: "旧モード", color: MODE_COLORS[12], isArchived: true },
];
const PROJECTS: readonly Project[] = [
  { id: 11, name: "案件A", isArchived: false },
  { id: 19, name: "旧案件", isArchived: true },
];

/** 日本時間の時刻から Date を作る（表示は Asia/Tokyo。_lib/format） */
const at = (clock: string) => new Date(`${DATE}T${clock}:00+09:00`);

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: DATE,
    name: `タスク${over.id}`,
    estimateMinutes: 30,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: over.id * 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

/** 完了タスク（開始・終了の両方が打刻済み）。実績と差異が確定している行を作る */
const done = (over: Partial<Task> & { id: number; startedAt: Date; endedAt: Date }) => task(over);

function view(over: Partial<DailyReviewView> = {}): DailyReviewView {
  return {
    date: DATE,
    log: [],
    totalMinutes: 0,
    postponed: [],
    modeTotals: [],
    projectTotals: [],
    modes: MODES,
    projects: PROJECTS,
    ...over,
  };
}

function renderBoard(over: Partial<DailyReviewView> = {}, isToday = false) {
  return render(<ReviewBoard view={view(over)} isToday={isToday} />);
}

/** 節（実績ログ / 先送り / 各集計）は見出しから辿る */
function sectionOf(heading: string | RegExp): HTMLElement {
  const found = screen.getByText(heading).closest("section");
  if (found === null) throw new Error(`section が見つかりません: ${String(heading)}`);
  return found;
}

function bodyRows(scope: HTMLElement): HTMLTableRowElement[] {
  return [...scope.querySelectorAll<HTMLTableRowElement>("tbody tr")];
}

/** 実績ログの列（§3.3: 開始-終了 / タスク名 / モード / プロジェクト / 見積 / 実績 / 差異） */
const LOG = {
  clock: 0,
  name: 1,
  mode: 2,
  project: 3,
  estimate: 4,
  actual: 5,
  diff: 6,
} as const;

function logRow(index = 0): HTMLTableRowElement {
  return bodyRows(sectionOf("実績ログ"))[index];
}

/** 集計の列（§3.5: 名前 / 実績 / 割合） */
const TOTAL = { name: 0, minutes: 1, share: 2 } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReviewBoard（画面定義書04 §3.1: 日付ナビ。§3.2: サマリ）", () => {
  // §3.1「S-01 と S-04 の表示日は連動させない」／O-1「URL のクエリに表示日を持つ」。
  // ナビの移動先が S-01（/）になっていないことは、リンクの href でしか判らない
  it("日付ナビの移動先は S-04 に閉じる（前日・翌日・今日へ）", () => {
    renderBoard({}, false);

    expect(screen.getByLabelText("前日").getAttribute("href")).toBe("/review?date=2026-07-19");
    expect(screen.getByLabelText("翌日").getAttribute("href")).toBe("/review?date=2026-07-21");
    expect(screen.getByText("今日へ").getAttribute("href")).toBe("/review");
  });

  it("画面見出しとサマリ（実行件数・実績合計・先送り件数）を出す", () => {
    renderBoard({
      log: [
        done({ id: 1, startedAt: at("06:30"), endedAt: at("06:48") }),
        done({ id: 2, startedAt: at("08:05"), endedAt: at("08:35") }),
      ],
      totalMinutes: 48,
      postponed: [task({ id: 3 })],
    });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("レビュー");
    const summary = screen.getByText(/実行 2件/);
    expect(summary.textContent).toBe("実行 2件実績 0:48先送り 1件");
  });

  it("表示日が今日以降なら先送りを出さない（まだ確定していないため。§3.4）", () => {
    renderBoard({ log: [], totalMinutes: 0, postponed: null }, true);

    expect(screen.getByText(/実行 0件/).textContent).toBe("実行 0件実績 0:00");
    expect(screen.queryByText(/^先送り（/)).toBeNull();
  });
});

describe("ReviewBoard（画面定義書04 §3.3: 実績ログ。F-501）", () => {
  it("0件なら表を出さず「実行したタスクはありません」と告げる", () => {
    renderBoard();

    expect(screen.queryByText("実行したタスクはありません")).not.toBeNull();
    expect(sectionOf("実績ログ").querySelector("table")).toBeNull();
  });

  it("列は 時刻/タスク名/モード/プロジェクト/見積/実績/差異 の順に並べる", () => {
    renderBoard({ log: [done({ id: 1, startedAt: at("06:30"), endedAt: at("06:48") })] });

    const labels = [...sectionOf("実績ログ").querySelectorAll("thead th")].map(
      (th) => th.textContent
    );
    expect(labels).toEqual([
      "時刻",
      "タスク名",
      "モード",
      "プロジェクト",
      "見積",
      "実績",
      "差異",
    ]);
  });

  it("各列に対応する値を出す（実績が見積より短ければ差異は `-`）", () => {
    renderBoard({
      log: [
        done({
          id: 1,
          name: "点検",
          estimateMinutes: 20,
          modeId: 1,
          projectId: 11,
          startedAt: at("06:30"),
          endedAt: at("06:48"),
        }),
      ],
      totalMinutes: 18,
    });

    const cells = logRow().cells;
    expect(cells[LOG.clock].textContent).toBe("06:30-06:48");
    expect(cells[LOG.name].textContent).toBe("点検");
    expect(cells[LOG.mode].textContent).toBe("モードA");
    expect(cells[LOG.project].textContent).toBe("案件A");
    expect(cells[LOG.estimate].textContent).toBe("0:20");
    expect(cells[LOG.actual].textContent).toBe("0:18");
    expect(cells[LOG.diff].textContent).toBe("-0:02");
    expect(cells[LOG.diff].className).not.toContain("text-danger");
  });

  it("超過は差異を `+` と警告色で出す", () => {
    renderBoard({
      log: [
        done({ id: 1, estimateMinutes: 20, startedAt: at("06:30"), endedAt: at("07:00") }),
      ],
      totalMinutes: 30,
    });

    const diff = logRow().cells[LOG.diff];
    expect(diff.textContent).toBe("+0:10");
    expect(diff.className).toContain("text-danger");
  });

  it("実行中の行は終了時刻を `--:--` にし、実績と差異を空にする（実績が確定していない）", () => {
    renderBoard({ log: [task({ id: 1, estimateMinutes: 20, startedAt: at("09:00") })] });

    const cells = logRow().cells;
    expect(cells[LOG.clock].textContent).toBe("09:00---:--");
    expect(cells[LOG.actual].textContent).toBe("--:--");
    expect(cells[LOG.diff].textContent).toBe("");
  });

  it("見積もり未設定（0分）は薄色の `--:--` にし、差異は出さない（比べる相手がない）", () => {
    renderBoard({
      log: [done({ id: 1, estimateMinutes: 0, startedAt: at("09:00"), endedAt: at("09:30") })],
      totalMinutes: 30,
    });

    const cells = logRow().cells;
    expect(cells[LOG.estimate].textContent).toBe("--:--");
    expect(cells[LOG.estimate].className).toContain("text-ink-faint");
    expect(cells[LOG.actual].textContent).toBe("0:30");
    expect(cells[LOG.diff].textContent).toBe("");
  });

  it("モード・プロジェクトが未設定なら薄色の `-` を出す（00_共通 §2.4）", () => {
    renderBoard({
      log: [done({ id: 1, startedAt: at("09:00"), endedAt: at("09:30") })],
      totalMinutes: 30,
    });

    for (const col of [LOG.mode, LOG.project]) {
      const target = logRow().cells[col];
      expect(target.textContent).toBe("-");
      expect(target.firstElementChild?.className).toContain("text-ink-faint");
    }
  });

  it("モード色を行全体のテキスト色に反映する（§2。S-01 と揃える）", () => {
    renderBoard({
      log: [done({ id: 1, modeId: 2, startedAt: at("09:00"), endedAt: at("09:30") })],
      totalMinutes: 30,
    });

    // jsdom は inline style の色を rgb() 表記へ正規化する（MODES[1] = MODE_COLORS[1]）
    expect(logRow().style.color).toBe("rgb(249, 115, 22)");
    expect(logRow().className).not.toContain("text-ink-muted");
  });

  it("モード未設定の行は既定のグレーにする", () => {
    renderBoard({
      log: [done({ id: 1, startedAt: at("09:00"), endedAt: at("09:30") })],
      totalMinutes: 30,
    });

    expect(logRow().style.color).toBe("");
    expect(logRow().className).toContain("text-ink-muted");
  });

  it("アーカイブ済みマスタも名前をそのまま出す（過去タスクからの参照を保つ）", () => {
    renderBoard({
      log: [
        done({ id: 1, modeId: 9, projectId: 19, startedAt: at("09:00"), endedAt: at("09:30") }),
      ],
      totalMinutes: 30,
    });

    expect(logRow().cells[LOG.mode].textContent).toBe("旧モード");
    expect(logRow().cells[LOG.project].textContent).toBe("旧案件");
  });

  it("タスク名から表示日の S-01 へ移動できる（O-2: 修正の導線）", () => {
    renderBoard({
      log: [done({ id: 1, name: "点検", startedAt: at("09:00"), endedAt: at("09:30") })],
      totalMinutes: 30,
    });

    const link = logRow().cells[LOG.name].querySelector("a");
    expect(link?.getAttribute("href")).toBe(`/?date=${DATE}`);
  });

  it("view の並びのまま行を出す（並べ替えは usecase 側で確定している）", () => {
    renderBoard({
      log: [
        done({ id: 1, name: "先", startedAt: at("06:30"), endedAt: at("06:40") }),
        done({ id: 2, name: "後", startedAt: at("08:00"), endedAt: at("08:10") }),
      ],
      totalMinutes: 20,
    });

    expect(bodyRows(sectionOf("実績ログ")).map((row) => row.cells[LOG.name].textContent)).toEqual([
      "先",
      "後",
    ]);
  });
});

describe("ReviewBoard（画面定義書04 §3.4: 先送り。F-502）", () => {
  it("件数に続けて何を先送りしたかを並べる", () => {
    renderBoard({ postponed: [task({ id: 1, name: "棚卸し" }), task({ id: 2, name: "見積依頼" })] });

    const section = sectionOf(/^先送り（/);
    expect(screen.getByText("先送り（2件）")).not.toBeNull();
    expect([...section.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "棚卸し",
      "見積依頼",
    ]);
  });

  it("0件なら「先送りはありません」と告げる", () => {
    renderBoard({ postponed: [] });

    expect(screen.getByText("先送り（0件）")).not.toBeNull();
    expect(screen.queryByText("先送りはありません")).not.toBeNull();
  });

  it("今日以降は節そのものを出さない", () => {
    renderBoard({ postponed: null }, true);

    expect(screen.queryByText(/^先送り（/)).toBeNull();
    expect(screen.queryByText("先送りはありません")).toBeNull();
  });
});

describe("ReviewBoard（画面定義書04 §3.5: モード別・プロジェクト別集計。F-503）", () => {
  it("2表それぞれに 名前 / 実績 / 割合 を出す", () => {
    renderBoard({
      totalMinutes: 100,
      modeTotals: [
        { key: 1, minutes: 64 },
        { key: 2, minutes: 36 },
      ],
      projectTotals: [{ key: 11, minutes: 18 }],
    });

    const modeRows = bodyRows(sectionOf("モード別集計"));
    expect(modeRows.map((row) => row.cells[TOTAL.name].textContent)).toEqual([
      "モードA",
      "モードB",
    ]);
    expect(modeRows[0].cells[TOTAL.minutes].textContent).toBe("1:04");
    expect(modeRows[0].cells[TOTAL.share].textContent).toBe("64%");

    const projectRows = bodyRows(sectionOf("プロジェクト別集計"));
    expect(projectRows[0].cells[TOTAL.name].textContent).toBe("案件A");
    expect(projectRows[0].cells[TOTAL.share].textContent).toBe("18%");
  });

  it("未設定のまとまりは行のラベルとして「（未設定）」と書く（00_共通 §2.4）", () => {
    renderBoard({ totalMinutes: 60, modeTotals: [{ key: null, minutes: 60 }] });

    const row = bodyRows(sectionOf("モード別集計"))[0];
    expect(row.cells[TOTAL.name].textContent).toBe("（未設定）");
    expect(row.cells[TOTAL.share].textContent).toBe("100%");
  });

  it("アーカイブ済みマスタも集計に含めて名前を出す", () => {
    renderBoard({ totalMinutes: 60, modeTotals: [{ key: 9, minutes: 60 }] });

    expect(bodyRows(sectionOf("モード別集計"))[0].cells[TOTAL.name].textContent).toBe("旧モード");
  });

  it("マスタが引き当てられない集計行は名前を空にする（行自体は落とさない）", () => {
    renderBoard({ totalMinutes: 60, modeTotals: [{ key: 404, minutes: 60 }] });

    const row = bodyRows(sectionOf("モード別集計"))[0];
    expect(row.cells[TOTAL.name].textContent).toBe("");
    expect(row.cells[TOTAL.minutes].textContent).toBe("1:00");
  });

  it("0件なら表を出さず「集計する実績がありません」と告げる（2表とも）", () => {
    renderBoard();

    expect(screen.getAllByText("集計する実績がありません")).toHaveLength(2);
    expect(sectionOf("モード別集計").querySelector("table")).toBeNull();
    expect(sectionOf("プロジェクト別集計").querySelector("table")).toBeNull();
  });
});

describe("ReviewBoard（画面定義書04 §5: 日付移動のショートカット。修飾キーは Shift のみ＝00_共通 §3）", () => {
  it("Shift+H で前日へ移動する", () => {
    renderBoard();

    fireEvent.keyDown(window, { key: "H", shiftKey: true });

    expect(router.push).toHaveBeenCalledWith("/review?date=2026-07-19");
  });

  it("Shift+L で翌日へ移動する", () => {
    renderBoard();

    fireEvent.keyDown(window, { key: "L", shiftKey: true });

    expect(router.push).toHaveBeenCalledWith("/review?date=2026-07-21");
  });

  it("T で今日へ戻る（日付パラメータなし）", () => {
    renderBoard();

    fireEvent.keyDown(window, { key: "t" });

    expect(router.push).toHaveBeenCalledWith("/review");
  });

  it("日付移動に割り当てていないキーは拾わない", () => {
    renderBoard();

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "Enter" });

    expect(router.push).not.toHaveBeenCalled();
  });

  it("Shift 中は日付移動の2キー以外を拾わない（Shift+T は動かない）", () => {
    renderBoard();

    fireEvent.keyDown(window, { key: "T", shiftKey: true });

    expect(router.push).not.toHaveBeenCalled();
  });

  it("Cmd/Ctrl/Alt との併用は操作として扱わない", () => {
    renderBoard();

    fireEvent.keyDown(window, { key: "H", shiftKey: true, metaKey: true });
    fireEvent.keyDown(window, { key: "H", shiftKey: true, ctrlKey: true });
    fireEvent.keyDown(window, { key: "t", altKey: true });

    expect(router.push).not.toHaveBeenCalled();
  });

  it("IME変換中のキーは操作として扱わない", () => {
    renderBoard();

    fireEvent.keyDown(window, { key: "L", shiftKey: true, isComposing: true });

    expect(router.push).not.toHaveBeenCalled();
  });

  // 入力欄は S-04 自体にはないが、リスナは window に張るので他の入力からも届きうる。
  // 生やす先を render の container にして、後片付けを setup.ts の cleanup に任せる
  for (const tag of ["input", "textarea"]) {
    it(`テキスト入力中（${tag}）のキーは無視する`, () => {
      const { container } = renderBoard();
      const field = container.appendChild(document.createElement(tag));

      fireEvent.keyDown(field, { key: "L", shiftKey: true });
      fireEvent.keyDown(field, { key: "t" });

      expect(router.push).not.toHaveBeenCalled();
    });
  }

  it("アンマウント後はキーを拾わない（リスナを外す）", () => {
    const { unmount } = renderBoard();

    unmount();
    fireEvent.keyDown(window, { key: "t" });

    expect(router.push).not.toHaveBeenCalled();
  });
});
