import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { rowOf } from "@/app/_testing/dom";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import {
  afternoon,
  colorOf,
  forenoon,
  morning,
  MODES,
  PROJECTS,
  SECTIONS,
  unclassifiedGroup,
} from "../_testing/factories";
import { cellsOf, headingOf, popoverLabels } from "../_testing/table-helpers";
import { DailyList, type DailyListProps } from "./daily-list";

/**
 * props は `DailyListProps` から派生させる（同じ形を手で写さない）。
 * **`groups` は必須**——どのテストも自分が描く行に依拠するので、既定値を持たせない
 * （テストが依拠する値は呼び出し側に書く。テスト戦略定義書 §4）
 */
type Overrides = Partial<Omit<DailyListProps, "groups">> & Pick<DailyListProps, "groups">;

function listElement(overrides: Overrides, handlers: Handlers) {
  return (
    <DailyList
      groups={overrides.groups}
      modes={overrides.modes ?? MODES}
      projects={overrides.projects ?? PROJECTS}
      sections={overrides.sections ?? SECTIONS}
      selectedId={overrides.selectedId ?? null}
      editing={overrides.editing ?? null}
      // `now` は実打刻の表示（`formatClock`）と予想開始・セクション残り
      // （`projectedStartTimes` / `sectionSlacks`）の両方へ流れるが、どちらも
      // `APP_TIME_ZONE` 基準なので `atJst` 一本で組める（T-47）
      now={overrides.now ?? atJst("10:00")}
      isToday={overrides.isToday ?? true}
      dayStartMinutes={overrides.dayStartMinutes ?? 0}
      // 現在セクションを `sections` と現在時刻から導出するのは board の仕事（§4.3）で、リストは
      // 受け取るだけ。既定は中立の「現在セクションなし」とし、依拠するテストが値を明示する
      currentSectionId={overrides.currentSectionId ?? null}
      stickyHeight={overrides.stickyHeight ?? 0}
      {...handlers}
    />
  );
}

type Handlers = Pick<
  DailyListProps,
  | "onRename"
  | "onEstimate"
  | "onPunch"
  | "onEditPunch"
  | "onAssign"
  | "onOperate"
  | "onRoutinize"
  | "onSelect"
  | "onBeginEdit"
  | "onEndEdit"
>;

function renderList(overrides: Overrides) {
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
  const result = render(listElement(overrides, handlers));
  return {
    ...result,
    ...handlers,
    /** 同じ木のまま props を差し替える（行が再マウントされない＝追従の再実行を見られる） */
    rerenderWith: (next: Overrides) => result.rerender(listElement(next, handlers)),
  };
}

let scrollIntoView: Mock;

beforeEach(() => {
  // jsdom はレイアウトを持たないため scrollIntoView が未実装。追従の有無だけを見る
  // （どれだけスクロールするかは実測値依存なのでブラウザ段。テスト戦略定義書 §3）。
  // **直代入は `restoreAllMocks` では戻らない**——毎テストの再代入で記録だけを新品にしている
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

  /**
   * 残り時間（F-110）はセクションごとに独立した値で、リストがまとめて求めて配る。
   * **値の意味づけ（max・独立・完了/実行中）は `projection.test.ts` が持つ**ので、
   * ここで見るのは配り分けと表示条件だけ。
   * 枠は 朝 06:00–09:00 / 午前 09:00–13:00 / 午後 13:00–翌06:00（`_testing/factories`）
   */
  describe("セクション残り時間の配り分けと表示条件（§3.2 / F-110）", () => {
    it("まだ始まっていないセクションは枠の頭から測る（現在時刻に引きずられない。FB-80）", () => {
      renderList({
        now: atJst("10:00"),
        groups: [
          forenoon(),
          afternoon([task({ id: 1, name: "夜の作業", estimateMinutes: 60 })]),
        ],
      });

      // 午後は 13:00–翌06:00 の枠17時間から60分を引いて +16:00。
      // 旧式は (翌06:00 − 10:00) − 60分 = +19:00 と、枠より大きい値を出していた
      expect(within(headingOf("午後")).queryByText("+16:00")).not.toBeNull();
    });

    it("セクションごとに別々の値を、それぞれの見出しへ配る（未分類には配らない）", () => {
      renderList({
        now: atJst("10:00"),
        groups: [
          unclassifiedGroup([task({ id: 1, name: "買い出しメモ", estimateMinutes: 120 })]),
          // 午前の枠は 10:00 時点で残り3時間しかないのに4時間ぶん積んである（1時間溢れる）
          forenoon([task({ id: 2, name: "設計書レビュー", estimateMinutes: 240 })]),
          afternoon([task({ id: 3, name: "夜の作業", estimateMinutes: 60 })]),
        ],
      });

      expect(within(headingOf("午前")).queryByText("-1:00")).not.toBeNull();
      // 午後は午前の溢れに影響されない（13:00 から60分 → 翌06:00 まで16時間。FB-81）
      expect(within(headingOf("午後")).queryByText("+16:00")).not.toBeNull();
      // 未分類は枠を持たないので残り時間の行き先にならない
      expect(headingOf("未分類").textContent).not.toContain("残り");
    });

    it("表示日が今日でなければ出さない（現在時刻起点の値のため）", () => {
      renderList({
        isToday: false,
        now: atJst("10:00"),
        groups: [forenoon([task({ id: 1, name: "設計書レビュー", estimateMinutes: 30 })])],
      });

      expect(headingOf("午前").textContent).not.toContain("残り");
      expect(headingOf("午前").textContent).toContain("合計");
    });

    it("現在時刻が枠の終了に達したら出さない（§3.2「終了時刻より前のときだけ」の境界）", () => {
      renderList({
        now: atJst("09:00"), // 朝（06:00–09:00）の終了ちょうど
        groups: [morning([task({ id: 1, name: "朝食", estimateMinutes: 30 })])],
      });

      expect(headingOf("朝").textContent).not.toContain("残り");
    });

    it("現在時刻が枠の終了より前なら出す（同じ境界の内側）", () => {
      renderList({
        now: atJst("08:59"),
        groups: [morning([task({ id: 1, name: "朝食", estimateMinutes: 30 })])],
      });

      expect(headingOf("朝").textContent).toContain("残り");
    });

    it("日界（F-116）を跨ぐ枠でも論理日の区切りで測る", () => {
      renderList({
        // 日界 06:00・深夜 02:00 は前の論理日の続き。午後（13:00–翌06:00）はまだ終わっていない
        dayStartMinutes: 360,
        now: atJst("02:00", "2026-07-27"),
        groups: [afternoon([task({ id: 1, name: "夜更かし", estimateMinutes: 60 })])],
      });

      // 枠はもう始まっているので 02:00 → 06:00 の240分から60分を引いて +3:00
      // （日界を 0 と取り違えると枠の終わりが翌々日の 06:00 になり +27:00 になる）
      expect(within(headingOf("午後")).queryByText("+3:00")).not.toBeNull();
    });
  });

  describe("現在セクションの強調（§3.2 / F-121）", () => {
    it("現在セクションの見出しだけ地色を変える（F-121）", () => {
      renderList({
        currentSectionId: 200, // 午前（09:00–13:00）。時刻からの導出は board が担う
        groups: [
          unclassifiedGroup([task({ id: 1, name: "買い出しメモ" })]),
          morning([task({ id: 2, name: "朝食" })]),
          forenoon([task({ id: 3, name: "設計書レビュー" })]),
        ],
      });

      expect(headingOf("午前").classList.contains("bg-band-now")).toBe(true);
      expect(headingOf("朝").classList.contains("bg-band-now")).toBe(false);
      expect(headingOf("朝").classList.contains("bg-band")).toBe(true);
      // 未分類は時間帯を持たないので対象外
      expect(headingOf("未分類").classList.contains("bg-band-now")).toBe(false);
    });

    it("現在セクションがなければ（表示日が今日でない等）どのセクションも強調しない（F-121）", () => {
      renderList({
        currentSectionId: null,
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

    it("セクションをまたいで積み上げ、日界（F-116）を起点に折り返して表す", () => {
      renderList({
        // 日界 06:00・深夜 02:00 は前の論理日の続き（暦日 0:00 起点なら 02:00 と出てしまう）
        dayStartMinutes: 360,
        now: atJst("02:00", "2026-07-27"),
        groups: [
          morning([task({ id: 1, name: "夜の片付け", estimateMinutes: 90 })]),
          forenoon([task({ id: 2, name: "日記", estimateMinutes: 15 })]),
        ],
      });

      // 1件目は now そのまま、2件目は前セクションの見積もり90分ぶん後ろ（グループをまたいでも
      // 積み上げをリセットしない）。どちらも論理日の中の位置として 24 時超えで表記する
      expect(cellsOf(rowOf("夜の片付け")).time.textContent).toBe("26:00–");
      expect(cellsOf(rowOf("日記")).time.textContent).toBe("27:30–");
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

    // 選択したままの行が並び替え（Shift+J/K）や自動セクション移動（§4.2）で位置を変えたら
    // 追従し直す。行は同じインスタンスのまま位置だけ変わるので、位置を見ていないと動かない
    it("選択行の位置が変わったら追従し直す（§4.2 / §5 / FB-20）", () => {
      const breakfast = task({ id: 1, name: "朝食" });
      const mail = task({ id: 2, name: "メール" });
      const { rerenderWith } = renderList({
        selectedId: 2,
        groups: [morning([breakfast, mail])],
      });

      expect(scrollIntoView).toHaveBeenCalledOnce();

      // 選択行（メール）がセクション内で1つ上へ動く
      rerenderWith({ selectedId: 2, groups: [morning([mail, breakfast])] });

      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    });
  });

  describe("セクション選択の候補（O-5 / §4.3）", () => {
    it("候補は「現在のセクションへ」＋未分類＋有効セクション（時間帯付き）で、選ぶと割り当てる", () => {
      const { onAssign } = renderList({
        currentSectionId: 200, // 午前（09:00–13:00）
        editing: { taskId: 1, field: "section" },
        groups: [morning([task({ id: 1, name: "朝食", sectionId: 100 })])],
      });

      expect(popoverLabels()).toEqual([
        "現在のセクションへ（午前）",
        "未分類",
        "朝06:00–09:00",
        "午前09:00–13:00",
        "午後13:00–06:00",
      ]);

      fireEvent.click(screen.getByText("午後"));
      expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "section", 300);
    });

    it("現在セクションがなければ（表示日が今日でない等）「現在のセクションへ」を出さない（§4.3）", () => {
      renderList({
        currentSectionId: null,
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
