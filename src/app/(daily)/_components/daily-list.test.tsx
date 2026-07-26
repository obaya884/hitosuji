import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Section } from "@/domain/section/section";
import type { DailyGroup } from "@/domain/task/daily-list";

import { rowOf } from "@/app/_testing/dom";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import {
  colorOf,
  forenoon,
  morning,
  MODES,
  PROJECTS,
  SECTIONS,
  unclassifiedGroup,
} from "../_testing/factories";
import { cellsOf, popoverLabels } from "../_testing/table-helpers";
import { DailyList } from "./daily-list";
import type { EditingCell } from "./task-row";

type Overrides = Readonly<{
  groups?: readonly DailyGroup[];
  sections?: readonly Section[];
  modes?: readonly Mode[];
  projects?: readonly Project[];
  selectedId?: number | null;
  editing?: EditingCell | null;
  now?: Date;
  isToday?: boolean;
  dayStartMinutes?: number;
  stickyHeight?: number;
}>;

function renderList(overrides: Overrides = {}) {
  const handlers = {
    onRename: vi.fn(),
    onEstimate: vi.fn(),
    onPunch: vi.fn(),
    onEditPunch: vi.fn(),
    onAssign: vi.fn(),
    onOperate: vi.fn(),
    onRoutinize: vi.fn(),
    onSelect: vi.fn(),
    onBeginEdit: vi.fn(),
    onEndEdit: vi.fn(),
  };
  const result = render(
    <DailyList
      groups={overrides.groups ?? [unclassifiedGroup()]}
      modes={overrides.modes ?? MODES}
      projects={overrides.projects ?? PROJECTS}
      sections={overrides.sections ?? SECTIONS}
      selectedId={overrides.selectedId ?? null}
      editing={overrides.editing ?? null}
      // `now` は実打刻の表示（`formatClock`）と予想開始・セクション終了
      // （`projectedStartTimes` / `sectionEndAt`）の両方へ流れるが、どちらも
      // `APP_TIME_ZONE` 基準なので `atJst` 一本で組める（T-47）
      now={overrides.now ?? atJst("10:00")}
      isToday={overrides.isToday ?? true}
      dayStartMinutes={overrides.dayStartMinutes ?? 0}
      stickyHeight={overrides.stickyHeight ?? 0}
      {...handlers}
    />
  );
  return { ...result, ...handlers };
}

/**
 * セクション見出し行（td が1つ = colSpan の行）。タスク行にも同じセクション名が
 * 併記される（§3.3）ため、まず行の形で見出しだけに絞ってから名前で引く
 */
function headingOf(label: string): HTMLElement {
  const heading = [...document.querySelectorAll("tr")]
    .filter((tr) => tr.querySelectorAll("td").length === 1)
    .find((tr) => within(tr as HTMLElement).queryByText(label) !== null);
  if (heading === undefined) throw new Error(`セクション見出し「${label}」が見つかりません`);
  return heading as HTMLElement;
}

let scrollIntoView: Mock;

beforeEach(() => {
  // jsdom はレイアウトを持たないため scrollIntoView が未実装。追従の有無だけを見る
  // （どれだけスクロールするかは実測値依存なのでブラウザ段。アーキテクチャ定義書 §8）
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// 部品そのものの描画・操作は部品ごとのテストが見る（group-heading / task-row / assign-cell）。
// ここで見るのは**リストが組み立てて渡す側**——列の骨格・現在セクションの導出・マスタの解決・
// 予想開始時刻の積み上げ・選択行と編集セルの写像
describe("DailyList（画面定義書01 §3.2/§3.3: 1タスク=1行のテーブル型リスト）", () => {
  it("列見出しを画面トップに1つだけ置く（§2）", () => {
    const { container } = renderList({ groups: [morning([task({ id: 1, name: "朝食" })])] });

    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["", "タスク", "プロジェクト", "モード", "見積", "実績", "実施時間", ""]);
  });

  describe("現在セクションの強調（§3.2 / F-121）", () => {
    it("現在時刻を含むセクションの見出しだけ地色を変える（F-121）", () => {
      renderList({
        now: atJst("10:00"),
        groups: [
          unclassifiedGroup([task({ id: 1, name: "買い出しメモ" })]),
          morning([task({ id: 2, name: "朝食" })]),
          forenoon([task({ id: 3, name: "設計書レビュー" })]),
        ],
      });

      // 10:00 は午前（09:00–13:00）
      expect(headingOf("午前").classList.contains("bg-band-now")).toBe(true);
      expect(headingOf("朝").classList.contains("bg-band-now")).toBe(false);
      expect(headingOf("朝").classList.contains("bg-band")).toBe(true);
      // 未分類は時間帯を持たないので対象外
      expect(headingOf("未分類").classList.contains("bg-band-now")).toBe(false);
    });

    it("表示日が今日でなければどのセクションも強調しない（F-121）", () => {
      renderList({
        isToday: false,
        now: atJst("10:00"),
        groups: [
          morning([task({ id: 1, name: "朝食" })]),
          forenoon([task({ id: 2, name: "設計書レビュー" })]),
        ],
      });

      expect(headingOf("午前").classList.contains("bg-band-now")).toBe(false);
      expect(headingOf("朝").classList.contains("bg-band-now")).toBe(false);
    });
  });

  describe("マスタの解決（modeId / projectId から名前と色を引く）", () => {
    it("割り当て済みは名前を出す（プロジェクト列はタスク名の直後・モードの左）", () => {
      renderList({
        groups: [morning([task({ id: 1, name: "日次プラン", projectId: 11, modeId: 1 })])],
      });

      const { project, mode } = cellsOf(rowOf("日次プラン"));
      expect(project.textContent).toBe("サイト改善");
      expect(mode.textContent).toBe("仕事");
    });

    it("アーカイブ済みプロジェクトも名前をそのまま表示する（過去タスクからの参照を保つ。§3.3）", () => {
      renderList({ groups: [morning([task({ id: 1, name: "日次プラン", projectId: 12 })])] });

      expect(cellsOf(rowOf("日次プラン")).project.textContent).toBe("終わった案件");
    });

    it("アーカイブ済みモードも名前と色をそのまま反映する（過去タスクから色ごと消えない）", () => {
      renderList({ groups: [morning([task({ id: 1, name: "日次プラン", modeId: 3 })])] });

      const row = rowOf("日次プラン");
      expect(cellsOf(row).mode.textContent).toBe("旧モード");
      // モードは行全体の文字色も担う（F-401）ので、名前だけでなく色も残ること
      expect(row.style.color).toBe(colorOf("旧モード"));
    });
  });

  describe("予想開始時刻（F-120 / §3.3）", () => {
    it("未実行行にだけ弱色で `HH:MM–` を併記する", () => {
      renderList({
        now: atJst("10:00"), // 予想開始も `APP_TIME_ZONE` 基準（T-47）
        groups: [
          morning([
            task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
            task({ id: 2, name: "メール", startedAt: atJst("08:05") }),
            task({ id: 3, name: "日次プラン", estimateMinutes: 15 }),
          ]),
        ],
      });

      // 実施時間セルは「実打刻（あれば）→ 予想開始」の順に並ぶ（§3.3: 実打刻と同じ位置に
      // 縦に並べて上から下へ時間の流れとして読ませる）ので、予想開始は常に最後の子
      const projected = cellsOf(rowOf("日次プラン")).time.lastElementChild as HTMLElement;
      // メール（実行中）は見積もり未設定＝残り0分なので、次の行の予想開始は now そのもの
      expect(projected.textContent).toBe("10:00–");
      // 実打刻（確定した記録）との区別は弱色が担う
      expect(projected.classList.contains("text-ink-faint")).toBe(true);

      // 打刻済みの行は実打刻だけ（予想は出さない）
      expect(cellsOf(rowOf("朝食")).time.textContent).toBe("06:30–06:48");
      expect(cellsOf(rowOf("メール")).time.textContent).toBe("08:05–");
    });

    it("表示日が今日でなければ出さない（終了予定・残り時間と同じ規律）", () => {
      renderList({
        isToday: false,
        groups: [morning([task({ id: 1, name: "日次プラン", estimateMinutes: 15 })])],
      });

      expect(cellsOf(rowOf("日次プラン")).time.textContent).toBe("");
    });
  });

  describe("行選択（§5）", () => {
    it("選択行は面色を変える", () => {
      renderList({
        selectedId: 2,
        groups: [morning([task({ id: 1, name: "朝食" }), task({ id: 2, name: "メール" })])],
      });

      expect(rowOf("メール").classList.contains("bg-accent-weak")).toBe(true);
      expect(rowOf("朝食").classList.contains("bg-accent-weak")).toBe(false);
    });

    // 「見えていれば動かす必要がない」＝ nearest の実挙動はレイアウトを持つブラウザ段でしか
    // 確かめられない。ここで見るのは「どの行が・何回・どの引数で呼ぶか」まで
    it("選択行だけが scrollIntoView({ block: nearest }) を1回呼ぶ（§5 / FB-20）", () => {
      renderList({
        selectedId: 2,
        groups: [morning([task({ id: 1, name: "朝食" }), task({ id: 2, name: "メール" })])],
      });

      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
      expect(scrollIntoView.mock.contexts[0]).toBe(rowOf("メール"));
    });
  });

  describe("セクション選択の候補（O-5 / §4.3）", () => {
    it("候補は「現在のセクションへ」＋未分類＋有効セクション（時間帯付き）で、選ぶと割り当てる", () => {
      const { onAssign } = renderList({
        now: atJst("10:00"),
        editing: { taskId: 1, field: "section" },
        groups: [morning([task({ id: 1, name: "朝食", sectionId: 100 })])],
      });

      expect(popoverLabels()).toEqual([
        // 10:00 は午前（09:00–13:00）
        "現在のセクションへ（午前）",
        "未分類",
        "朝06:00–09:00",
        "午前09:00–13:00",
        "午後13:00–06:00",
      ]);

      fireEvent.click(screen.getByText("午後"));
      expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "section", 300);
    });

    it("表示日が今日でなければ「現在のセクションへ」を出さない（§4.3）", () => {
      renderList({
        isToday: false,
        editing: { taskId: 1, field: "section" },
        groups: [morning([task({ id: 1, name: "朝食", sectionId: 100 })])],
      });

      expect(popoverLabels()[0]).toBe("未分類");
      expect(popoverLabels().some((l) => l.startsWith("現在のセクションへ"))).toBe(false);
    });
  });

  describe("編集中セルの割り当て（親が単一の真実を持つ）", () => {
    it("編集中の行だけが入力になる（他の行は表示のまま）", () => {
      renderList({
        editing: { taskId: 2, field: "name" },
        groups: [morning([task({ id: 1, name: "朝食" }), task({ id: 2, name: "メール" })])],
      });

      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      expect(screen.getByRole("textbox")).toHaveProperty("value", "メール");
      expect(screen.queryByText("朝食")).not.toBeNull();
    });

    it("編集していない行にポップオーバーは出さない", () => {
      renderList({
        editing: { taskId: 2, field: "mode" },
        groups: [morning([task({ id: 1, name: "朝食" }), task({ id: 2, name: "メール" })])],
      });

      // 開いているのは1つだけ（行を取り違えていない）
      const popover = (document.querySelector("[data-option-index]") as HTMLElement).closest("td");
      expect(popover).toBe(cellsOf(rowOf("メール")).mode);
    });
  });
});
