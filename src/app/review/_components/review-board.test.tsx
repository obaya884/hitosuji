import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { faintTextOf, hasClass, rgbOf } from "@/app/_testing/dom";
import { otherRouterCalls, router } from "@/app/_testing/next-navigation";
import { MODE_COLOR_PRESETS, type Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import type { Task } from "@/domain/task/task";
import { task } from "@/domain/task/testing/task";
import type { DailyReviewView } from "@/usecases/review/review-usecases";

import { ReviewBoard } from "./review-board";

const MODES: readonly Mode[] = [
  { id: 1, name: "モードA", color: MODE_COLOR_PRESETS[0].value, isArchived: false },
  { id: 2, name: "モードB", color: MODE_COLOR_PRESETS[1].value, isArchived: false },
  { id: 9, name: "旧モード", color: MODE_COLOR_PRESETS[12].value, isArchived: true },
];
const PROJECTS: readonly Project[] = [
  { id: 11, name: "案件A", isArchived: false },
  { id: 19, name: "旧案件", isArchived: true },
];

/** 完了タスク（開始・終了の両方が打刻済み）。実績と差異が確定している行を作る */
const done = (over: Partial<Task> & { id: number; startedAt: Date; endedAt: Date }) => task(over);

function view(over: Partial<DailyReviewView> = {}): DailyReviewView {
  return {
    date: TEST_DATE,
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

/** サマリ（§3.2）はラベルと数値が別要素なので、まとめている親を返す */
function summaryOf(): HTMLElement {
  return screen.getByText("実行").parentElement as HTMLElement;
}

describe("ReviewBoard（画面定義書04 §3.1: 日付ナビ。§3.2: サマリ）", () => {
  // §3.1「S-01 と S-04 の表示日は連動させない」／O-1「URL のクエリに表示日を持つ」。
  // ナビの移動先が S-01（/）になっていないことは、リンクの href でしか判らない
  it("日付ナビの移動先は S-04 に閉じる（前日・翌日・今日へ）", () => {
    renderBoard({}, false);

    expect(screen.getByLabelText("前日").getAttribute("href")).toBe("/review?date=2026-07-25");
    expect(screen.getByLabelText("翌日").getAttribute("href")).toBe("/review?date=2026-07-27");
    expect(screen.getByText("今日へ").getAttribute("href")).toBe("/review");
  });

  it("画面見出しとサマリ（実行件数・実績合計・先送り件数）を出す", () => {
    renderBoard({
      log: [
        done({ id: 1, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
        done({ id: 2, startedAt: atJst("08:05"), endedAt: atJst("08:35") }),
      ],
      totalMinutes: 48,
      postponed: [task({ id: 3 })],
    });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("レビュー");
    // ラベルと数値は別要素（ラベルは従・数値は主。00_共通 §1.1）なので親の textContent で読む
    const summary = summaryOf();
    expect(summary.textContent).toBe("実行 2件実績 0:48先送り 1件");
  });

  it("表示日が今日以降なら先送りを出さない（まだ確定していないため。§3.4）", () => {
    renderBoard({ log: [], totalMinutes: 0, postponed: null }, true);

    expect(summaryOf().textContent).toBe("実行 0件実績 0:00");
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
    renderBoard({ log: [done({ id: 1, startedAt: atJst("06:30"), endedAt: atJst("06:48") })] });

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
          startedAt: atJst("06:30"),
          endedAt: atJst("06:48"),
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
    expect(hasClass(cells[LOG.diff], "text-danger")).toBe(false);
  });

  it("超過は差異を `+` と警告色で出す", () => {
    renderBoard({
      log: [
        done({ id: 1, estimateMinutes: 20, startedAt: atJst("06:30"), endedAt: atJst("07:00") }),
      ],
      totalMinutes: 30,
    });

    const diff = logRow().cells[LOG.diff];
    expect(diff.textContent).toBe("+0:10");
    expect(hasClass(diff, "text-danger")).toBe(true);
  });

  // 警告色が付くかどうかの境界そのもの。表記と色の両方を見る（§3.3）
  it("実績が見積ぴったりなら差異は符号なしの `0:00` で、警告色も付かない", () => {
    renderBoard({
      log: [
        done({ id: 1, estimateMinutes: 30, startedAt: atJst("06:30"), endedAt: atJst("07:00") }),
      ],
      totalMinutes: 30,
    });

    const diff = logRow().cells[LOG.diff];
    expect(diff.textContent).toBe("0:00");
    expect(hasClass(diff, "text-danger")).toBe(false);
  });

  it("実行中の行は終了時刻と実績を薄色の `--:--` にし、差異だけを空にする（実績が確定していない）", () => {
    renderBoard({ log: [task({ id: 1, estimateMinutes: 20, startedAt: atJst("09:00") })] });

    const cells = logRow().cells;
    expect(cells[LOG.clock].textContent).toBe("09:00---:--");
    expect(cells[LOG.actual].textContent).toBe("--:--");
    expect(cells[LOG.diff].textContent).toBe("");
    // 開始–終了は確定値と同居するので、薄いのは記号側だけ（00_共通 §2.4）
    expect(faintTextOf(cells[LOG.clock])).toBe("--:--");
    expect(faintTextOf(cells[LOG.actual])).toBe("--:--");
  });

  it("見積もり未設定（0分）は薄色の `--:--` にし、差異は出さない（比べる相手がない）", () => {
    renderBoard({
      log: [done({ id: 1, estimateMinutes: 0, startedAt: atJst("09:00"), endedAt: atJst("09:30") })],
      totalMinutes: 30,
    });

    const cells = logRow().cells;
    expect(cells[LOG.estimate].textContent).toBe("--:--");
    expect(faintTextOf(cells[LOG.estimate])).toBe("--:--");
    expect(cells[LOG.actual].textContent).toBe("0:30");
    expect(cells[LOG.diff].textContent).toBe("");
  });

  // 実績の0分は確定値なので `--:--` にしない（§3.3 / 00_共通 §2.4）。見積もりと同じ機構へ
  // 寄せる整理を止める段（見積もりの0は未設定、実績の0は値、で意味が違う）
  it("同分内に開始終了した実績（0分）は `0:00` と出し、薄色にしない", () => {
    renderBoard({
      log: [done({ id: 1, estimateMinutes: 20, startedAt: atJst("09:00"), endedAt: atJst("09:00") })],
      totalMinutes: 0,
    });

    const cells = logRow().cells;
    expect(cells[LOG.actual].textContent).toBe("0:00");
    expect(faintTextOf(cells[LOG.actual])).toBeUndefined();
  });

  it("モード・プロジェクトが未設定なら薄色の `-` を出す（00_共通 §2.4）", () => {
    renderBoard({
      log: [done({ id: 1, startedAt: atJst("09:00"), endedAt: atJst("09:30") })],
      totalMinutes: 30,
    });

    for (const col of [LOG.mode, LOG.project]) {
      const target = logRow().cells[col];
      expect(target.textContent).toBe("-");
      expect(hasClass(target.firstElementChild!, "text-ink-faint")).toBe(true);
    }
  });

  it("モード色を行全体のテキスト色に反映する（§2。S-01 と揃える）", () => {
    renderBoard({
      log: [done({ id: 1, modeId: 2, startedAt: atJst("09:00"), endedAt: atJst("09:30") })],
      totalMinutes: 30,
    });

    // jsdom は inline style の色を rgb() 表記へ正規化する
    // 添字ではなく id で引く（フィクスチャを並び替えても主張が変わらない）
    expect(logRow().style.color).toBe(rgbOf(MODES.find((m) => m.id === 2)!.color));
    expect(hasClass(logRow(), "text-ink-muted")).toBe(false);
  });

  it("モード未設定の行は既定のグレーにする", () => {
    renderBoard({
      log: [done({ id: 1, startedAt: atJst("09:00"), endedAt: atJst("09:30") })],
      totalMinutes: 30,
    });

    expect(logRow().style.color).toBe("");
    expect(hasClass(logRow(), "text-ink-muted")).toBe(true);
  });

  it("アーカイブ済みマスタも名前をそのまま出す（過去タスクからの参照を保つ）", () => {
    renderBoard({
      log: [
        done({ id: 1, modeId: 9, projectId: 19, startedAt: atJst("09:00"), endedAt: atJst("09:30") }),
      ],
      totalMinutes: 30,
    });

    expect(logRow().cells[LOG.mode].textContent).toBe("旧モード");
    expect(logRow().cells[LOG.project].textContent).toBe("旧案件");
  });

  it("タスク名から表示日の S-01 へ移動できる（O-2: 修正の導線）", () => {
    renderBoard({
      log: [done({ id: 1, name: "点検", startedAt: atJst("09:00"), endedAt: atJst("09:30") })],
      totalMinutes: 30,
    });

    const link = logRow().cells[LOG.name].querySelector("a");
    expect(link?.getAttribute("href")).toBe(`/?date=${TEST_DATE}`);
  });

  it("view の並びのまま行を出す（並べ替えは usecase 側で確定している）", () => {
    renderBoard({
      log: [
        done({ id: 1, name: "先", startedAt: atJst("06:30"), endedAt: atJst("06:40") }),
        done({ id: 2, name: "後", startedAt: atJst("08:00"), endedAt: atJst("08:10") }),
      ],
      totalMinutes: 20,
    });

    expect(bodyRows(sectionOf("実績ログ")).map((row) => row.cells[LOG.name].textContent)).toEqual([
      "先",
      "後",
    ]);
  });

  // F-118 / §3.3: ハイライトは塗りの⭐だけを出す（読み取り専用なので付け外しの入口を置かない）
  // §3.3: ⭐はタスク名の**先頭**（理由は review-board.tsx 側のコメントが持つ）
  it("⭐はタスク名の先頭に置く", () => {
    renderBoard({
      log: [
        done({
          id: 1,
          name: "提案書",
          startedAt: atJst("09:00"),
          endedAt: atJst("09:52"),
          highlighted: true,
        }),
      ],
      totalMinutes: 52,
    });

    const nameCell = logRow().cells[LOG.name];
    const star = within(nameCell).getByRole("img", { name: "ハイライト" });
    const link = within(nameCell).getByRole("link");
    // ⭐がリンク（タスク名）より前に現れる＝先頭にある
    expect(star.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 名前と1つのまとまりに見えるよう間隔を詰める（8→2px。経緯は log_04）
    expect(hasClass(star, "mr-0.5")).toBe(true);
  });

  it("ハイライトされたタスクの行に⭐を出す", () => {
    renderBoard({
      log: [
        done({
          id: 1,
          name: "提案書",
          startedAt: atJst("09:00"),
          endedAt: atJst("09:52"),
          highlighted: true,
        }),
      ],
      totalMinutes: 52,
    });

    const star = within(logRow().cells[LOG.name]).getByRole("img", { name: "ハイライト" });
    // 塗りも色トークンもデイリー（§3.3）と同じにする——同じ印が画面ごとに違って見えないため
    expect(star.querySelector("polygon")?.getAttribute("fill")).toBe("currentColor");
    expect(hasClass(star, "text-highlight-mark")).toBe(true);
    // 列は7つのまま（⭐で列を増やしていない）
    expect(logRow().cells).toHaveLength(7);
  });

  it("ハイライトされていない行には⭐も場所の確保も出さない（S-01 と違い輪郭を出さない）", () => {
    renderBoard({
      log: [
        done({ id: 1, name: "点検", startedAt: atJst("09:00"), endedAt: atJst("09:30") }),
      ],
      totalMinutes: 30,
    });

    expect(logRow().cells[LOG.name].querySelector("svg")).toBeNull();
  });

  it("⭐に付け外しの入口を置かない（読み取り専用。付け外しは S-01 の O-17）", () => {
    renderBoard({
      log: [
        done({
          id: 1,
          name: "提案書",
          startedAt: atJst("09:00"),
          endedAt: atJst("09:52"),
          highlighted: true,
        }),
      ],
      totalMinutes: 52,
    });

    expect(logRow().cells[LOG.name].querySelector("button")).toBeNull();
  });

  // F-206 / §3.3: コメントは列にせず行の下に全文を出す（読み返しが目的なので切り詰めない）
  it("コメントは「そのタスクの直下」に出す（列は増やさない）", () => {
    // 2件のうち先頭だけにコメントを付ける——末尾へまとめて出す実装と区別するため
    renderBoard({
      log: [
        done({
          id: 1,
          name: "資料作成",
          startedAt: atJst("09:00"),
          endedAt: atJst("09:52"),
          comment: "図表の差し替えに時間がかかった",
        }),
        done({ id: 2, name: "メール返信", startedAt: atJst("10:00"), endedAt: atJst("10:14") }),
      ],
      totalMinutes: 66,
    });

    // 列は7つのまま（コメント列を足していない）
    expect(logRow().cells).toHaveLength(7);
    expect(logRow(1).textContent).toContain("図表の差し替えに時間がかかった");
    // 3行目は次のタスク（コメントが末尾へ寄っていない）
    expect(logRow(2).cells[LOG.name].textContent).toBe("メール返信");
  });

  it("コメントは読み取り専用で出す（編集の入口を置かない。§3.3）", () => {
    renderBoard({
      log: [
        done({
          id: 1,
          name: "資料作成",
          startedAt: atJst("09:00"),
          endedAt: atJst("09:52"),
          comment: "図表の差し替えに時間がかかった",
        }),
      ],
      totalMinutes: 52,
    });

    const commentRow = logRow(1);
    expect(commentRow.querySelector("textarea")).toBeNull();
    expect(commentRow.querySelector("button")).toBeNull();
  });

  it("コメントのない行は行を増やさない", () => {
    renderBoard({
      log: [done({ id: 1, name: "点検", startedAt: atJst("09:00"), endedAt: atJst("09:30") })],
      totalMinutes: 30,
    });

    expect(bodyRows(sectionOf("実績ログ"))).toHaveLength(1);
  });

  it("コメントの改行を保って表示する（書いたとおりに読み返せる）", () => {
    renderBoard({
      log: [
        done({
          id: 1,
          name: "資料作成",
          startedAt: atJst("09:00"),
          endedAt: atJst("09:52"),
          comment: "・図表を差し替えた\n・次は雛形を用意する",
        }),
      ],
      totalMinutes: 52,
    });

    expect(hasClass(logRow(1).cells[LOG.name], "whitespace-pre-wrap")).toBe(true);
    // 折り返す幅はタスク名列に揃える（S-01 と同じ規則。行いっぱいには広げない）
    expect(logRow(1).cells[LOG.name].colSpan).toBe(1);
    // 右側は空セルで埋めて表の列数と揃える（下線が途中で切れない）
    const spanned = [...logRow(1).cells].reduce((n, c) => n + c.colSpan, 0);
    expect(spanned).toBe(sectionOf("実績ログ").querySelectorAll("thead th").length);
    // 下線はコメント行が持ち、タスク行は譲る（2本の線で分断しない）
    expect(hasClass(logRow(), "border-b")).toBe(false);
    expect(hasClass(logRow(1), "border-b")).toBe(true);
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

    expect(router.push).toHaveBeenCalledWith("/review?date=2026-07-25");
    // 表示日は URL のクエリに持つ（O-1）ので、遷移手段は push だけ
    expect(otherRouterCalls()).toEqual([]);
  });

  it("Shift+L で翌日へ移動する", () => {
    renderBoard();

    fireEvent.keyDown(window, { key: "L", shiftKey: true });

    expect(router.push).toHaveBeenCalledWith("/review?date=2026-07-27");
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
