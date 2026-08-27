import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { hasClass } from "@/app/_testing/dom";
import { installResizeObserver, resizeTo, ResizeObserverStub } from "@/app/_testing/resize-observer";
import { atJst, NEXT_TEST_DATE, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import {
  afternoon,
  BUNDLES,
  bundleColorOf,
  colorOf,
  forenoon,
  morning,
  MODES,
  PROJECTS,
  SECTIONS,
  unclassifiedGroup,
} from "../_testing/factories";
import { cellsOf, headingOf, popoverLabels, taskRow } from "../_testing/table-helpers";
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
      // 表示日。セクション残り時間の枠をこの日に敷く（§3.2）ので、既定は `now` と同じ日にする
      date={overrides.date ?? TEST_DATE}
      isToday={overrides.isToday ?? true}
      // 既定は打刻できる日（今日以前）。行へそのまま流すだけなので、出し分けは task-row.test.tsx が見る（§7）
      // ——ただし残り時間（§3.2）の「過去日か」はリストがこれと `isToday` の否定で決めるので、
      // 未来日に依拠するテストは `date` と一緒にこちらも立てる
      isFutureDate={overrides.isFutureDate ?? false}
      dayStartMinutes={overrides.dayStartMinutes ?? 0}
      // 現在セクションを `sections` と現在時刻から導出するのは board の仕事（§4.3）で、リストは
      // 受け取るだけ。既定は中立の「現在セクションなし」とし、依拠するテストが値を明示する
      currentSectionId={overrides.currentSectionId ?? null}
      boardHeight={overrides.boardHeight ?? 0}
      // バンドルの道（F-119）。既定はフィクスチャ全件を引ける Map（依拠するテストは
      // task.bundleId を明示すれば解決される。解決そのものを見ないテストには影響しない）
      bundleById={overrides.bundleById ?? new Map(BUNDLES.map((b) => [b.id, b]))}
      {...handlers}
    />
  );
}

type Handlers = Pick<
  DailyListProps,
  | "onRename"
  | "onEstimate"
  | "onComment"
  | "onPunch"
  | "onEditPunch"
  | "onAssign"
  | "onOperate"
  | "onToggleHighlight"
  | "onRoutinize"
  | "onSelect"
  | "onBeginEdit"
  | "onEndEdit"
>;

function renderList(overrides: Overrides) {
  const handlers = {
    onRename: vi.fn(),
    onEstimate: vi.fn(),
    onComment: vi.fn(),
    onPunch: vi.fn(),
    onEditPunch: vi.fn(),
    onAssign: vi.fn(),
    onOperate: vi.fn(),
    onToggleHighlight: vi.fn(),
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
  // 列見出し・セクション見出しの高さを実測する（§2）ので jsdom に無い API を補う
  installResizeObserver();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// 部品そのものの描画・操作は部品ごとのテストが見る（group-heading / task-row / assign-cell）。
// ここで見るのは**リストが組み立てて渡す側**——列の骨格・現在セクションの導出・マスタの解決・
// 予想開始時刻の積み上げ・選択行と編集セルの写像
describe("DailyList（画面定義書01 §3.2/§3.3: 1タスク=1行のテーブル型リスト）", () => {
  it("列見出しを画面トップに1つだけ置く（§2）", () => {
    const { container } = renderList({ groups: [morning([task({ id: 1, name: "朝食" })])] });

    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    // 先頭の空見出しはバンドルの道（F-119 / §3.3）。名前は常設せず帯にマウスを乗せたときにだけ出す
    expect(headers).toEqual(["", "", "タスク", "プロジェクト", "モード", "見積", "実績", "実施時間", ""]);
  });

  /**
   * 固定領域の積み上げ（§2 / FB-77）。**貼り付いて見えるかどうか（幾何）は jsdom では測れない**
   * ので段3（ブラウザ）が見る。ここで見るのは**どの段がどの高さを起点にしているか**——
   * 板 → 列見出し → セクション見出しの順で、下の段ほど上の段の高さぶん下がる
   */
  describe("固定領域の積み上げ（§2: 板 → 列見出し → セクション見出し）", () => {
    const columnHeadCells = () => [...document.querySelectorAll<HTMLElement>("thead th")];
    const columnHeadRow = () => document.querySelector("thead tr")!;
    // 実測は `resizeTo` で差し込む（jsdom の `offsetHeight` は常に 0 なので値は外から与える）
    const oneTask = () => [morning([task({ id: 1, name: "朝食" })])];

    // 固定そのもの。**`top` や地色は sticky を外しても残る**ので、この主張が無いと
    // 「固定をやめる」変異が全テスト緑のまま通る（§2 の中核が無防備になる）
    it("列見出しとセクション見出しは固定のクラスを持つ（§2: sticky で画面上端に固定する）", () => {
      renderList({ groups: oneTask() });

      expect(columnHeadCells().every((th) => hasClass(th, "sticky"))).toBe(true);
      expect(hasClass(headingOf("朝"), "sticky")).toBe(true);
      // `<tr>` に付けても効かないので、行側に紛れていないことも見る
      expect(hasClass(columnHeadRow(), "sticky")).toBe(false);
    });

    it("列見出しは板の高さに貼り付く", () => {
      renderList({ groups: oneTask(), boardHeight: 96 });

      // 9セルすべてに同じ `top` が要る（`<tr>` には sticky が効かないのでセル側に付ける）
      expect(columnHeadCells().map((th) => th.style.top)).toEqual(Array(9).fill("96px"));
    });

    // 幾何は測れないが、地色の欠落は「貼り付いた見出しの下を流れる行が透ける」形で必ず壊れる
    it("貼り付く2段はどちらも地色を持つ（透けると下を流れる行が読めてしまう）", () => {
      renderList({ groups: oneTask() });

      expect(columnHeadCells().every((th) => hasClass(th, "bg-paper"))).toBe(true);
      expect(hasClass(headingOf("朝"), "bg-band")).toBe(true);
    });

    /**
     * 罫線は「板の下端」ではなく「列見出しの下端」に1本だけ（§2 の一枚板）。**行ではなくセルが持つ**
     * ——`border-collapse: collapse` では行の罫線が貼り付いたセルと一緒に動かない（`tableHeadRule`）
     */
    it("罫線は列見出しのセルが1本だけ持つ（板とリストの境界。§2）", () => {
      renderList({ groups: oneTask() });

      expect(columnHeadCells().every((th) => hasClass(th, "border-b"))).toBe(true);
      expect(hasClass(columnHeadRow(), "border-b")).toBe(false);
    });

    /**
     * 重なり順（§2）。実効の重なりはブラウザ段だが、**トークンの取り違えはここで止められる**——
     * 見出しを浮遊面（`z-10`）以上にすると、行メニュー・ポップオーバーが見出しの裏に隠れる
     */
    it("貼り付いた見出しは浮遊面より下・通常の行より上に置く（板 > 列見出し > セクション見出し）", () => {
      renderList({ groups: oneTask() });

      expect(columnHeadCells().every((th) => hasClass(th, "z-2"))).toBe(true);
      expect(hasClass(headingOf("朝"), "z-1")).toBe(true);
      // 通常の行は重なり順を持たない（持たせると見出しと競る）
      expect(taskRow("朝食").className).not.toMatch(/\bz-\d/);
    });

    it("セクション見出しは板と列見出しの合計に貼り付く", () => {
      renderList({ groups: oneTask(), boardHeight: 96 });

      resizeTo(columnHeadRow(), 32);

      expect(headingOf("朝").style.top).toBe("128px");
    });

    it("行の追従は3段すべてを避ける高さで止まる（§5。足し損ねると行が見出しの裏に隠れる）", () => {
      renderList({ groups: oneTask(), boardHeight: 96 });

      resizeTo(columnHeadRow(), 32);
      resizeTo(headingOf("朝"), 36);

      expect(taskRow("朝食").style.scrollMarginTop).toBe("164px");
    });

    // 未分類は時間帯の枠を持たないが、固定の扱いは他のグループと揃える（§2）
    it("未分類グループの見出しも同じ高さに貼り付く（グループの種類で出し分けない）", () => {
      renderList({
        groups: [unclassifiedGroup([task({ id: 1, name: "買い出しメモ" })]), ...oneTask()],
        boardHeight: 96,
      });

      resizeTo(columnHeadRow(), 32);

      expect([headingOf("未分類").style.top, headingOf("朝").style.top]).toEqual([
        "128px",
        "128px",
      ]);
    });

    /**
     * 見出しの切り替わりは**重ね合わせ**で成り立つ（§2。過ぎたセクションの見出しも同じ位置に
     * 残るので、見えているのは常に最前面の1つ）。**成立の条件は「不透明」「高さが揃う」
     * 「重なり順が同じ」**の3つで、地色と重なり順はここで守れる（高さは実測なので段3）。
     * どれかがグループごとに食い違うと、積み重なった見出しが透けたりはみ出したりする
     */
    it("どの見出しも同じ地色と同じ重なり順を持つ（置き換えが重ね合わせで成り立つ。§2）", () => {
      renderList({
        groups: [unclassifiedGroup([task({ id: 1, name: "買い出しメモ" })]), ...oneTask()],
      });

      const headings = [headingOf("未分類"), headingOf("朝")];
      expect(headings.every((h) => hasClass(h, "bg-band"))).toBe(true);
      expect(headings.every((h) => hasClass(h, "z-1"))).toBe(true);
    });

    it("見出しの高さは先頭の1つだけ測る（どれも同じ高さなので観測を増やさない）", () => {
      renderList({
        groups: [unclassifiedGroup([task({ id: 1, name: "買い出しメモ" })]), morning([])],
      });

      resizeTo(headingOf("未分類"), 36);

      // 2つ目以降は観測対象ではない。**見出しを引くのは expect の外**——`headingOf` 自身も
      // 投げるので、中に入れると「見出しが描かれなくなった」回帰まで緑にしてしまう
      const second = headingOf("朝");
      expect(() => ResizeObserverStub.observing(second)).toThrow();
    });
  });

  // group-heading.tsx の colSpan を手で列見出しの数に合わせているので、列を足したときに
  // 静かにずれないよう機械的に主張する（コメント行の同種の主張は §3.3「コメント」describe が持つ）
  it("セクション見出し行の colSpan は列見出しの数と一致する（列を足しても見出しが表全体を覆う）", () => {
    renderList({ groups: [morning([task({ id: 1, name: "朝食" })])] });

    // 見出しはセル1つで表全体を覆う（`headingOf` が返すのがそのセル）
    const heading = headingOf("朝") as HTMLTableCellElement;
    expect(heading.colSpan).toBe(document.querySelectorAll("thead th").length);
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
        now: atJst("08:00"), // 午前（09:00–13:00）はまだ始まっていない
        groups: [forenoon([task({ id: 1, name: "設計書レビュー", estimateMinutes: 60 })])],
      });

      // 09:00 から60分 → 10:00。13:00 まで +3:00。
      // 現在時刻起点だと (13:00 − 08:00) − 60分 = +4:00 になる
      expect(within(headingOf("午前")).queryByText("+3:00")).not.toBeNull();
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

    it("表示日が過去なら出さない（やり残しが枠を食った量は時間合計が語る。FB-104）", () => {
      renderList({
        isToday: false, // 未来日でもないので過去日
        date: "2026-07-25",
        // **枠の終了が now より後になる組み合わせで見る**——午後（13:00–翌06:00）は前日ぶんでも
        // 翌 06:00 まで伸びるので、深夜 02:00 の時点ではまだ終わっていない。ここを今日と同じ
        // 昼の時刻にすると「now < 枠の終了」の絞り込みだけで消え、過去日の判定が素通りする
        now: atJst("02:00", "2026-07-26"),
        groups: [afternoon([task({ id: 1, name: "夜更かし", estimateMinutes: 30 })])],
      });

      expect(headingOf("午後").textContent).not.toContain("残り");
      expect(headingOf("午後").textContent).toContain("合計");
    });

    it("未来日でも出す。枠は表示日に敷くので値は「枠の長さ − 見積もり」になる（FB-104）", () => {
      renderList({
        isToday: false,
        isFutureDate: true,
        date: NEXT_TEST_DATE, // 翌日。now は今日のまま（枠の頭より前になる）
        now: atJst("10:00"),
        groups: [forenoon([task({ id: 1, name: "設計書レビュー", estimateMinutes: 60 })])],
      });

      // 午前の枠は4時間。今日基準で測ると (翌13:00 − 10:00) − 60分 = +26:00 になってしまう
      expect(within(headingOf("午前")).queryByText("+3:00")).not.toBeNull();
    });

    it("日界が 00:00 でないとき、暦日が同じでも未来の論理日なら出す（F-116 × FB-104）", () => {
      renderList({
        isToday: false,
        isFutureDate: true,
        dayStartMinutes: 360, // 日界 06:00 → now(07-27 02:00) の論理日は 07-26 で、07-27 は未来日
        date: NEXT_TEST_DATE,
        now: atJst("02:00", NEXT_TEST_DATE),
        groups: [forenoon([task({ id: 1, name: "設計書レビュー", estimateMinutes: 60 })])],
      });

      // 07-27 の午前は 07-27 09:00–13:00。now の暦日で敷くと同じ 07-27 でも
      // 論理日の起点が前日にずれ、枠が now より前だと誤って測りうる
      expect(within(headingOf("午前")).queryByText("+3:00")).not.toBeNull();
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

      const { project, mode } = cellsOf(taskRow("日次プラン"));
      expect(project.textContent).toBe("サイト改善");
      expect(mode.textContent).toBe("仕事");
    });

    it("アーカイブ済みプロジェクトも名前をそのまま表示する（過去タスクからの参照を保つ。§3.3）", () => {
      renderList({ groups: [morning([task({ id: 1, name: "日次プラン", projectId: 12 })])] });

      expect(cellsOf(taskRow("日次プラン")).project.textContent).toBe("終わった案件");
    });

    it("アーカイブ済みモードも名前と色をそのまま反映する（過去タスクから色ごと消えない）", () => {
      renderList({ groups: [morning([task({ id: 1, name: "日次プラン", modeId: 3 })])] });

      const row = taskRow("日次プラン");
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
      const projected = cellsOf(taskRow("日次プラン")).time.lastElementChild as HTMLElement;
      // メール（実行中）は見積もり未設定＝残り0分なので、次の行の予想開始は now そのもの
      expect(projected.textContent).toBe("10:00–");
      // 実打刻（確定した記録）との区別は弱色が担う
      expect(projected.classList.contains("text-ink-faint")).toBe(true);

      // 打刻済みの行は実打刻だけ（予想は出さない）
      expect(cellsOf(taskRow("朝食")).time.textContent).toBe("06:30–06:48");
      expect(cellsOf(taskRow("メール")).time.textContent).toBe("08:05–");
    });

    // 同じグループの中でも表示順に積む。ここが崩れると**行の並びは正しいまま値だけ入れ替わる**ので、
    // 1グループ1件で組んだ下のテスト（またぎの順序）では捕まらない
    it("同じセクションの中でも表示順に積み上げる", () => {
      renderList({
        now: atJst("10:00"),
        groups: [
          morning([
            task({ id: 1, name: "資料作成", estimateMinutes: 30 }),
            task({ id: 2, name: "レビュー依頼", estimateMinutes: 15 }),
          ]),
        ],
      });

      expect(cellsOf(taskRow("資料作成")).time.textContent).toBe("10:00–");
      expect(cellsOf(taskRow("レビュー依頼")).time.textContent).toBe("10:30–");
    });

    it("セクションをまたいで積み上げ、日界（F-116）を起点に日またぎを判定して表す", () => {
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
      // 積み上げをリセットしない）。どちらも論理日の暦日をまたいだ側なので「翌」を前置する
      expect(cellsOf(taskRow("夜の片付け")).time.textContent).toBe("翌 02:00–");
      expect(cellsOf(taskRow("日記")).time.textContent).toBe("翌 03:30–");
      // 前置が付く行でも警告色にはしない（§3.3。超過の警告はサマリ行の終了予定が担う）
      expect(cellsOf(taskRow("夜の片付け")).time.querySelector(".text-danger")).toBe(null);
    });

    it("表示日が過去なら出さない（終了予定 F-104 と同じ規律）", () => {
      renderList({
        isToday: false,
        date: "2026-07-25",
        groups: [morning([task({ id: 1, name: "日次プラン", estimateMinutes: 15 })])],
      });

      expect(cellsOf(taskRow("日次プラン")).time.textContent).toBe("");
    });

    it("未来日でも出さない（残り時間 F-110 と違って未来へは広げない。§3.3 / FB-104）", () => {
      renderList({
        isToday: false,
        isFutureDate: true,
        date: NEXT_TEST_DATE,
        groups: [morning([task({ id: 1, name: "日次プラン", estimateMinutes: 15 })])],
      });

      expect(cellsOf(taskRow("日次プラン")).time.textContent).toBe("");
    });
  });

  describe("行選択（§5）", () => {
    it("選択行は面色を変える", () => {
      renderList({
        selectedId: 2,
        groups: [morning([task({ id: 1, name: "朝食" }), task({ id: 2, name: "メール" })])],
      });

      expect(taskRow("メール").classList.contains("bg-accent-weak")).toBe(true);
      expect(taskRow("朝食").classList.contains("bg-accent-weak")).toBe(false);
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
      expect(scrollIntoView.mock.contexts[0]).toBe(taskRow("メール"));
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
      expect(popover).toBe(cellsOf(taskRow("メール")).mode);
    });
  });

  describe("コメント（F-206 / §3.3 / O-16）", () => {
    const WITH_COMMENT = task({ id: 1, name: "朝食", comment: "パンが切れていた" });
    const WITHOUT_COMMENT = task({ id: 2, name: "メール" });

    it("コメントのある行にだけ印を出す（無い行には出さない）", () => {
      renderList({ groups: [morning([WITH_COMMENT, WITHOUT_COMMENT])] });

      expect(within(taskRow("朝食")).queryByLabelText("コメントを編集")).not.toBeNull();
      expect(within(taskRow("メール")).queryByLabelText("コメントを編集")).toBeNull();
    });

    it("印を押すとコメント編集を要求する（マウスからの入口）", () => {
      const { onBeginEdit } = renderList({ groups: [morning([WITH_COMMENT])] });

      fireEvent.click(within(taskRow("朝食")).getByLabelText("コメントを編集"));

      expect(onBeginEdit).toHaveBeenCalledWith(WITH_COMMENT, "comment");
    });

    it("選択行でだけ全文を行の下に出す（未選択なら印だけ）", () => {
      const { rerenderWith } = renderList({ groups: [morning([WITH_COMMENT])] });

      expect(screen.queryByText("パンが切れていた")).toBeNull();

      rerenderWith({ selectedId: 1, groups: [morning([WITH_COMMENT])] });

      expect(screen.queryByText("パンが切れていた")).not.toBeNull();
    });

    it("コメントを持たない行は選択しても行が増えない（§3.3: 未設定行に印も欄も出さない）", () => {
      renderList({ selectedId: 2, groups: [morning([WITH_COMMENT, WITHOUT_COMMENT])] });

      // 見出し1 ＋ タスク2行だけ（コメント行は増えていない）
      expect(document.querySelectorAll("tbody tr")).toHaveLength(3);
    });

    it("編集中は選択していなくても入力欄を開き、確定でコメントを渡す（O-16）", () => {
      const { onComment } = renderList({
        editing: { taskId: 1, field: "comment" },
        groups: [morning([WITH_COMMENT])],
      });

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveProperty("value", "パンが切れていた");

      fireEvent.change(textarea, { target: { value: "買い足す" } });
      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onComment).toHaveBeenCalledWith(WITH_COMMENT, "買い足す");
    });

    it("Shift+Enter は確定せず改行として通す（§6）", () => {
      const { onComment, onEndEdit } = renderList({
        editing: { taskId: 1, field: "comment" },
        groups: [morning([WITH_COMMENT])],
      });

      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });

      expect(onComment).not.toHaveBeenCalled();
      expect(onEndEdit).not.toHaveBeenCalled();
    });

    it("Esc は確定せず編集を閉じる（00_共通 §2.3）", () => {
      const { onComment, onEndEdit } = renderList({
        editing: { taskId: 1, field: "comment" },
        groups: [morning([WITH_COMMENT])],
      });

      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

      expect(onComment).not.toHaveBeenCalled();
      expect(onEndEdit).toHaveBeenCalled();
    });

    it("フォーカスが外れたら確定する（00_共通 §2.3。他のインライン編集と同じ）", () => {
      const { onComment, onEndEdit } = renderList({
        editing: { taskId: 1, field: "comment" },
        groups: [morning([WITH_COMMENT])],
      });

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "買い足す" } });
      fireEvent.blur(textarea);

      expect(onComment).toHaveBeenCalledWith(WITH_COMMENT, "買い足す");
      expect(onEndEdit).toHaveBeenCalled();
    });

    // 行いっぱいに広げると、コメントが伸びるたび右側の列（プロジェクト・モード・時間）の
    // 見え方が変わる。折り返し幅はタスク名列に揃える（§3.3）
    it("折り返す幅はタスク名列に揃える（プロジェクト列の手前で折り返す）", () => {
      renderList({ selectedId: 1, groups: [morning([WITH_COMMENT])] });

      const commentCell = screen.getByText("パンが切れていた").closest("td") as HTMLTableCellElement;
      const cells = [...(commentCell.closest("tr") as HTMLElement).querySelectorAll("td")];
      // バンドルの道（列0）・打刻ボタン列（列1）の次＝タスク名列の位置に、1列分だけの幅で置く
      expect(cells.indexOf(commentCell)).toBe(2);
      expect(commentCell.colSpan).toBe(1);
    });

    it("右側は空セルで埋めて表の列数と揃える（面色・下線が途中で切れない）", () => {
      renderList({ selectedId: 1, groups: [morning([WITH_COMMENT])] });

      const commentRow = screen.getByText("パンが切れていた").closest("tr") as HTMLElement;
      const spanned = [...commentRow.querySelectorAll("td")].reduce((n, c) => n + c.colSpan, 0);
      expect(spanned).toBe(document.querySelectorAll("thead th").length);
    });

    it("選択行のコメント行にも面色を乗せる（行が2段でも1行に見える）", () => {
      renderList({ selectedId: 1, groups: [morning([WITH_COMMENT])] });

      const commentRow = screen.getByText("パンが切れていた").closest("tr") as HTMLElement;
      expect(hasClass(commentRow, "bg-accent-weak")).toBe(true);
    });

    // 地色の規則はタスク行と共有する（§3.3 / `_lib/row-background.ts`）。コメント行が出るのは
    // 選択行だけなので、ハイライト行でも実際に出る面色は選択の `accent-weak` になる
    it("ハイライト行でもコメント行は選択の面色にし、ハイライトの地色は出さない（F-118 / §3.3）", () => {
      renderList({
        selectedId: 1,
        groups: [morning([{ ...WITH_COMMENT, highlighted: true }])],
      });

      const commentRow = screen.getByText("パンが切れていた").closest("tr") as HTMLElement;
      expect(hasClass(commentRow, "bg-accent-weak")).toBe(true);
      expect(hasClass(commentRow, "bg-highlight")).toBe(false);
    });

    // 短いコメントでも2行分は開けておく（1行だと書き足す余地が見えない）
    it.each([
      ["コメント無しで開く", null, 2],
      ["1行のコメント", "1行だけ", 2],
      ["3行のコメント", "1行目\n2行目\n3行目", 3],
    ])("入力欄の初期の高さは %s なら %s 行", (_label, comment, rows) => {
      renderList({
        editing: { taskId: 1, field: "comment" },
        groups: [morning([task({ id: 1, name: "朝食", comment })])],
      });

      expect(screen.getByRole("textbox")).toHaveProperty("rows", rows);
    });

    it("全文は折り返して出す（改行を保つ。§3.3）", () => {
      renderList({
        selectedId: 1,
        groups: [morning([task({ id: 1, name: "朝食", comment: "・パンが切れていた\n・買い足す" })])],
      });

      const commentCell = screen.getByText(/パンが切れていた/);
      expect(hasClass(commentCell, "whitespace-pre-wrap")).toBe(true);
    });

    it("コメント行にもモード色を乗せる（補助表記としてセクション併記と同じ扱い。§3.3）", () => {
      renderList({
        selectedId: 1,
        groups: [morning([task({ id: 1, name: "朝食", modeId: 1, comment: "パンが切れていた" })])],
      });

      const commentRow = screen.getByText("パンが切れていた").closest("tr") as HTMLElement;
      expect(commentRow.style.color).toBe(colorOf("仕事"));
    });

    it("コメント行を開く行は下線をコメント行へ譲る（2本の線で分断しない）", () => {
      renderList({ selectedId: 1, groups: [morning([WITH_COMMENT])] });

      const opener = taskRow("朝食");
      const commentRow = screen.getByText("パンが切れていた").closest("tr") as HTMLElement;
      expect(hasClass(opener, "border-b")).toBe(false);
      expect(hasClass(commentRow, "border-b")).toBe(true);
    });

    it("コメントを開かない行は下線を自分で持つ", () => {
      renderList({ groups: [morning([WITHOUT_COMMENT])] });

      expect(hasClass(taskRow("メール"), "border-b")).toBe(true);
    });
  });

  // 行の描画そのもの（帯の出し方・色・名前）は task-row.test.tsx が見る。ここで見るのは
  // リストが担う解決だけ——task.bundleId を bundleById（親が組む Map）で引いて行へ渡すところ
  describe("バンドルの道（F-119 / §3.3。task.bundleId → bundle の解決）", () => {
    it("bundleById で解決した色を行の道に渡す", () => {
      renderList({ groups: [morning([task({ id: 1, name: "ラジオ体操", bundleId: 5 })])] });

      const road = within(taskRow("ラジオ体操")).getByTestId("bundle-road");
      expect(road.style.backgroundColor).toBe(bundleColorOf("朝の立上げ"));
    });

    it("bundleId が null の行には道を渡さない（帯を出さない）", () => {
      renderList({ groups: [morning([task({ id: 1, name: "単発タスク", bundleId: null })])] });

      expect(within(taskRow("単発タスク")).queryByTestId("bundle-road")).toBeNull();
    });

    // 隣接（前後の行が同じバンドルかどうか）は見ない——2件のバンドルを間に非メンバーを挟んで
    // 並べても、各行は自分の bundleId だけで独立に道を出す
    it("間に非メンバーの行を挟んでも、両側のメンバー行はそれぞれ独立に道を出す", () => {
      renderList({
        groups: [
          morning([
            task({ id: 1, name: "ラジオ体操", bundleId: 5 }),
            task({ id: 2, name: "見積り確認" }),
            task({ id: 3, name: "夜のクローズ準備", bundleId: 6 }),
          ]),
        ],
      });

      expect(
        within(taskRow("ラジオ体操")).getByTestId("bundle-road").style.backgroundColor
      ).toBe(bundleColorOf("朝の立上げ"));
      expect(within(taskRow("見積り確認")).queryByTestId("bundle-road")).toBeNull();
      expect(
        within(taskRow("夜のクローズ準備")).getByTestId("bundle-road").style.backgroundColor
      ).toBe(bundleColorOf("夜のクローズ"));
    });

    it("選択行の下に開くコメント行にも道を渡す（2段で1件のタスクなので面と同じく帯も伸ばす）", () => {
      renderList({
        selectedId: 1,
        groups: [morning([task({ id: 1, name: "朝食", bundleId: 5, comment: "パンが切れていた" })])],
      });

      const commentRow = screen.getByText("パンが切れていた").closest("tr") as HTMLElement;
      const road = within(commentRow).getByTestId("bundle-road");
      expect(road.style.backgroundColor).toBe(bundleColorOf("朝の立上げ"));
    });
  });
});
