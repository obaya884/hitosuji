import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { faintTextOf, hasClass } from "@/app/_testing/dom";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import {
  bundleColorOf,
  bundleOf,
  colorOf,
  modeOf,
  MODES,
  PROJECTS,
  SECTIONS,
} from "../_testing/factories";
import { cellsOf, checkedPopoverLabels, popoverLabels, taskRow } from "../_testing/table-helpers";
import { TaskRow, type TaskRowProps } from "./task-row";

/**
 * props は `TaskRowProps` から派生させる（同じ形を手で写さない）。**`task` だけ必須**——
 * どのテストも自分が描く行に依拠するので既定値を持たせない（テスト戦略定義書 §4）。
 */
type Overrides = Partial<Omit<TaskRowProps, "task">> & Pick<TaskRowProps, "task">;

function renderRow(overrides: Overrides) {
  const handlers = {
    onRename: vi.fn(),
    onEstimate: vi.fn(),
    onPunch: vi.fn(),
    onEditPunch: vi.fn(),
    onAssign: vi.fn(),
    onOperate: vi.fn(),
    onToggleHighlight: vi.fn(),
    // 既定は「発火できた」。抑止に当たった側（false）は盤面テストが持つ（00_共通 §4.2）
    onRoutinize: vi.fn().mockReturnValue(true),
    onSelect: vi.fn(),
    onBeginEdit: vi.fn(),
    onEndEdit: vi.fn(),
  };
  const result = render(
    <table>
      <tbody>
        <TaskRow
          task={overrides.task}
          bundle={overrides.bundle ?? null}
          index={overrides.index ?? 0}
          sectionId={overrides.sectionId ?? null}
          mode={overrides.mode}
          project={overrides.project}
          modes={overrides.modes ?? MODES}
          projects={overrides.projects ?? PROJECTS}
          sections={overrides.sections ?? SECTIONS}
          // セクション候補の組み立ては親（DailyList）の担当（O-5 / §4.3）。行は受け取って
          // 渡すだけなので、候補そのものを見るテストは daily-list.test.tsx にある
          sectionOptions={overrides.sectionOptions ?? []}
          isSelected={overrides.isSelected ?? false}
          editing={overrides.editing ?? null}
          // 実打刻の表示（`formatClock`）は JST 固定なので、時刻を assert するテストは `atJst` で組む
          now={overrides.now ?? atJst("10:00")}
          projectedStart={overrides.projectedStart ?? null}
          // 既定は打刻できる日（今日以前）。未来日の行は「打刻ボタンを出さない」テストが自分で渡す（§7）
          isFutureDate={overrides.isFutureDate ?? false}
          stickyHeight={overrides.stickyHeight ?? 0}
          {...handlers}
        />
      </tbody>
    </table>
  );
  return { ...result, ...handlers };
}

// jsdom はレイアウトを持たず `scrollIntoView` が未実装。選択行を描くテスト（`isSelected: true`）が
// 追従の副作用で落ちないよう詰めておく（追従そのものの検証は daily-list.test.tsx が持つ）。
// `vi.fn()` にするのは、将来ここで追従を見たくなったときに黙って飲み込まれないため。
// この直代入だけは `restoreAllMocks` で戻らない（jsdom に元の実装が無く、無害）
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TaskRow（画面定義書01 §3.3: 1タスク=1行のセルとその入口）", () => {
  describe("タスク行の状態別表示（状態は打刻から導出する）", () => {
    it("未実行は開始ボタン（押したときの動作を示す。F-201）", () => {
      renderRow({ task: task({ id: 1, name: "日次プラン" }) });

      const button = within(cellsOf(taskRow("日次プラン")).punch).getByRole("button");
      expect(button.getAttribute("aria-label")).toBe("開始");
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it("実行中は終了ボタン", () => {
      renderRow({ task: task({ id: 1, name: "メール", startedAt: atJst("08:05") }) });

      const button = within(cellsOf(taskRow("メール")).punch).getByRole("button");
      expect(button.getAttribute("aria-label")).toBe("終了");
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it("完了は操作なし（押せない）", () => {
      renderRow({
        task: task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      });

      const button = within(cellsOf(taskRow("朝食")).punch).getByRole("button");
      expect(button.getAttribute("aria-label")).toBe("完了済み");
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it.each([
      ["未実行", task({ id: 1, name: "日次プラン" })],
      ["実行中", task({ id: 1, name: "日次プラン", startedAt: atJst("08:05") })],
      [
        "完了",
        task({ id: 1, name: "日次プラン", startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      ],
    ])("未来日は%s行でも打刻ボタンを出さない（§7: 未来日では打刻を受け付けない）", (_state, t) => {
      renderRow({ task: t, isFutureDate: true });

      expect(within(cellsOf(taskRow("日次プラン")).punch).queryByRole("button")).toBe(null);
    });

    it("完了は実績を出す（F-202）", () => {
      renderRow({
        task: task({ id: 1, name: "朝食", estimateMinutes: 20, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      });

      const { actual } = cellsOf(taskRow("朝食"));
      expect(actual.textContent).toBe("→ 0:18");
      expect((actual.firstElementChild as HTMLElement).classList.contains("text-danger")).toBe(false);
    });

    it("実績が見積もりを超えたら警告色（F-202）", () => {
      renderRow({
        task: task({ id: 1, name: "朝食", estimateMinutes: 10, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      });

      const { actual } = cellsOf(taskRow("朝食"));
      expect((actual.firstElementChild as HTMLElement).classList.contains("text-danger")).toBe(true);
    });

    it("見積もり未設定なら超過判定しない（0分との比較で常に警告色にならない）", () => {
      renderRow({
        task: task({ id: 1, name: "朝食", estimateMinutes: 0, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      });

      const { actual } = cellsOf(taskRow("朝食"));
      expect((actual.firstElementChild as HTMLElement).classList.contains("text-danger")).toBe(false);
    });

    it("1分未満の実績は `0:00` と表示する（§3.3 / 00_共通 §2.4: 値が確定しているものは `--:--` にしない）", () => {
      renderRow({
        // 開始と終了が同じ＝実績0分。値は確定しているので `--:--` にはしない
        task: task({ id: 1, name: "朝食", estimateMinutes: 20, startedAt: atJst("06:30"), endedAt: atJst("06:30") }),
      });

      expect(cellsOf(taskRow("朝食")).actual.textContent).toBe("→ 0:00");
    });

    it("実行中は経過を出す（F-205。実績は出さない）", () => {
      renderRow({
        now: atJst("08:17"),
        task: task({ id: 1, name: "メール", estimateMinutes: 30, startedAt: atJst("08:05") }),
      });

      expect(cellsOf(taskRow("メール")).actual.textContent).toBe("(経過 0:12)");
    });

    it("経過が見積もりを超えたら警告色（F-205。完了の実績超過と同じ規則）", () => {
      renderRow({
        now: atJst("09:00"),
        task: task({ id: 1, name: "メール", estimateMinutes: 10, startedAt: atJst("08:05") }),
      });

      const { actual } = cellsOf(taskRow("メール"));
      expect(actual.textContent).toBe("(経過 0:55)");
      expect((actual.firstElementChild as HTMLElement).classList.contains("text-danger")).toBe(true);
    });

    // 実績は打刻の結果なので空欄でよい（00_共通 §2.4「記録・導出のセル」）
    it("未実行は実績も経過も出さない（空欄。§3.3 / 00_共通 §2.4）", () => {
      renderRow({ task: task({ id: 1, name: "日次プラン" }) });

      expect(cellsOf(taskRow("日次プラン")).actual.textContent).toBe("");
    });

    it("完了は開始–終了の両方を出す（F-203）", () => {
      renderRow({
        task: task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      });

      expect(cellsOf(taskRow("朝食")).time.textContent).toBe("06:30–06:48");
    });

    it("実行中は開始だけを出す（F-203。終了側は空欄で `--:--` を出さない）", () => {
      renderRow({ task: task({ id: 1, name: "メール", startedAt: atJst("08:05") }) });

      expect(cellsOf(taskRow("メール")).time.textContent).toBe("08:05–");
    });

    // 実打刻は終了予定・予想開始と同じ列に並ぶが、あちらの日またぎ前置（§3.1）は付けない
    it("暦日をまたいで走った打刻も `HH:MM` のまま（F-203。「翌」を前置しない。§3.3）", () => {
      renderRow({
        task: task({
          id: 1,
          name: "夜更かし",
          startedAt: atJst("23:40"),
          endedAt: atJst("00:10", "2026-07-27"),
        }),
      });

      expect(cellsOf(taskRow("夜更かし")).time.textContent).toBe("23:40–00:10");
    });
  });

  describe("未設定の表記（00_共通 §2.4: 設定できるセルは空欄にしない）", () => {
    it("未設定でも列の用途が読める aria-label を付ける（列の並びは §3.3）", () => {
      renderRow({ task: task({ id: 1, name: "日次プラン" }) });

      // 列位置つきで見る（2列は同じ `AssignCell` なので、label を入れ替えても位置を見ないと通る）
      const { project, mode } = cellsOf(taskRow("日次プラン"));
      expect(within(project).queryByLabelText("プロジェクト（未設定）")).not.toBeNull();
      expect(within(mode).queryByLabelText("モード（未設定）")).not.toBeNull();
    });

    it("見積もり未設定（0分）は薄色の `--:--`（終了予定の計算に入っていないことを示す。§3.3）", () => {
      renderRow({ task: task({ id: 1, name: "買い出しメモ", estimateMinutes: 0 }) });

      const button = within(cellsOf(taskRow("買い出しメモ")).estimate).getByRole("button");
      expect(button.textContent).toBe("--:--");
      expect(faintTextOf(button)).toBe("--:--");
    });

    it("見積もり設定済みは H:MM を通常色で出す", () => {
      renderRow({ task: task({ id: 1, name: "日次プラン", estimateMinutes: 15 }) });

      const button = within(cellsOf(taskRow("日次プラン")).estimate).getByRole("button");
      expect(button.textContent).toBe("0:15");
      expect(faintTextOf(button)).toBeUndefined();
    });
  });

  describe("予想開始時刻（F-120 / §3.3）", () => {
    // 出す行の判定と時刻の積み上げは親（DailyList）の担当で daily-list.test.tsx が見る。
    // 行が見るのは「渡されたら実施時間セルに弱色で並べる」ところまで
    it("渡されたら実施時間セルに弱色で出す", () => {
      renderRow({
        task: task({ id: 1, name: "日次プラン", estimateMinutes: 15 }),
        projectedStart: "10:00–",
      });

      const projected = within(cellsOf(taskRow("日次プラン")).time).getByText("10:00–");
      // 実打刻（確定した記録）との区別は弱色が担う
      expect(projected.classList.contains("text-ink-faint")).toBe(true);
    });

    it("実打刻がある行では実打刻の後ろに並べる（§3.3: 上から下へ時間の流れとして読ませる）", () => {
      // DailyList は打刻済みの行に予想開始を渡さないが、並べる順序は行側の責務なので
      // ここで固定する（渡されたら実打刻 → 予想開始の順）
      renderRow({
        task: task({ id: 1, name: "メール", startedAt: atJst("08:05") }),
        projectedStart: "10:00–",
      });

      const { time } = cellsOf(taskRow("メール"));
      expect([...time.children].map((child) => child.textContent)).toEqual(["08:05", "10:00–"]);
    });
  });

  describe("行選択（§5）", () => {
    it("行のクリックで選択する（マウスとキーボードは等価）", () => {
      const { onSelect } = renderRow({ task: task({ id: 7, name: "朝食" }) });

      fireEvent.click(taskRow("朝食"));

      expect(onSelect).toHaveBeenCalledWith(7);
    });

    // 選択の面色（`bg-accent-weak`）と追従（`scrollIntoView`）は「どの行が選択行か」の
    // 写像とセットで意味を持つため、2行を描いて比べる形で daily-list.test.tsx が見る
    it("固定領域の高さぶん余白を取り、追従した行が裏に隠れないようにする（§2 / §5）", () => {
      renderRow({ stickyHeight: 96, task: task({ id: 1, name: "朝食" }) });

      expect(taskRow("朝食").style.scrollMarginTop).toBe("96px");
    });
  });

  describe("ハイライト（F-118 / §3.3 / O-17）", () => {
    /** ⭐は**タスク名セルの中（コメント印の右）**に置く（§3.3）ので、セルの内側から取る */
    const starOf = (name: string) =>
      within(cellsOf(taskRow(name)).name).getByRole("button", { name: "ハイライト" });
    /** 塗り（ON）か輪郭（OFF）か。`StarIcon` の `filled` がそのまま `fill` に出る */
    const starFill = (name: string) => starOf(name).querySelector("polygon")?.getAttribute("fill");

    it("ハイライト行は地色を変え、⭐を塗りつぶす", () => {
      renderRow({ task: task({ id: 1, name: "提案書", highlighted: true }) });

      expect(hasClass(taskRow("提案書"), "bg-highlight")).toBe(true);
      expect(starFill("提案書")).toBe("currentColor");
      expect(hasClass(starOf("提案書"), "text-highlight-mark")).toBe(true);
    });

    it("ハイライトされていない行は地色を変えない", () => {
      renderRow({ task: task({ id: 1, name: "提案書", highlighted: false }) });

      expect(hasClass(taskRow("提案書"), "bg-highlight")).toBe(false);
    });

    it("選択行の未ハイライトの⭐は輪郭で、色も弱める", () => {
      renderRow({ task: task({ id: 1, name: "提案書", highlighted: false }), isSelected: true });

      expect(starFill("提案書")).toBe("none");
      expect(hasClass(starOf("提案書"), "text-ink-faint")).toBe(true);
    });

    // 地色を落とすのは①選択中②完了だけ（§3.3）。実行中は落とさない
    it("実行中のハイライト行は地色を出す", () => {
      renderRow({
        task: task({ id: 1, name: "提案書", highlighted: true, startedAt: atJst("09:00") }),
      });

      expect(hasClass(taskRow("提案書"), "bg-highlight")).toBe(true);
    });

    // 選択中は地色を選択（`bg-accent-weak`）に譲り、⭐が印を担う（§3.3）
    it("選択中のハイライト行はハイライトの地色を出さない（⭐は塗ったまま）", () => {
      renderRow({ task: task({ id: 1, name: "提案書", highlighted: true }), isSelected: true });

      expect(hasClass(taskRow("提案書"), "bg-highlight")).toBe(false);
      expect(starFill("提案書")).toBe("currentColor");
    });

    // 完了した行は地色を出さず⭐だけ残す（§3.3。済んだものから視線を集める力を引く）
    it("完了したハイライト行は地色を出さず、⭐は塗りつぶしのまま", () => {
      renderRow({
        task: task({
          id: 1,
          name: "提案書",
          highlighted: true,
          startedAt: atJst("09:00"),
          endedAt: atJst("09:30"),
        }),
      });

      expect(hasClass(taskRow("提案書"), "bg-highlight")).toBe(false);
      expect(starFill("提案書")).toBe("currentColor");
    });

    // OFF の輪郭は選択行にだけ出す。ホバーでは出さず、場所も空けない（§3.3）
    it("未ハイライトかつ未選択の行には⭐を出さない", () => {
      renderRow({ task: task({ id: 1, name: "提案書", highlighted: false }) });

      expect(
        within(cellsOf(taskRow("提案書")).name).queryByRole("button", { name: "ハイライト" })
      ).toBeNull();
    });

    it("ハイライト行の⭐は未選択でも出す", () => {
      renderRow({ task: task({ id: 1, name: "提案書", highlighted: true }) });

      expect(starFill("提案書")).toBe("currentColor");
    });

    // §3.3 の並び順は `タスク名 → セクション併記 → コメント印 → ⭐`。
    // セクション併記はボタンなので、名前セルのボタン列だけで全順序が押さえられる
    it("⭐はセクション併記・コメント印の後ろ（＝コメント印の右）に並べる", () => {
      renderRow({
        task: task({ id: 1, name: "提案書", highlighted: true, comment: "メモ", sectionId: 100 }),
      });

      const marks = within(cellsOf(taskRow("提案書")).name).getAllByRole("button");
      expect(marks.map((m) => m.getAttribute("aria-label") ?? m.textContent)).toEqual([
        "提案書",
        "朝",
        "コメントを編集",
        "ハイライト",
      ]);
    });

    // 名前の編集中はセクション併記・コメント印とともに隠す（入力欄に場所を譲る。§3.3）
    it("タスク名の編集中は⭐も隠す", () => {
      renderRow({
        task: task({ id: 1, name: "提案書", highlighted: true }),
        editing: "name",
      });

      expect(screen.queryByRole("button", { name: "ハイライト" })).toBeNull();
    });

    it("⭐のクリックでトグルし、行の選択もその行へ移す", () => {
      const { onToggleHighlight, onSelect } = renderRow({
        task: task({ id: 7, name: "提案書", highlighted: true }),
      });

      fireEvent.click(starOf("提案書"));

      expect(onToggleHighlight).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
      // 行の onClick へ伝播させない（選択を二重に走らせない）
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith(7);
    });

    it("行メニューの ON の行では「ハイライトを外す」と出してトグルする", () => {
      const { onToggleHighlight } = renderRow({
        task: task({ id: 7, name: "提案書", highlighted: true }),
      });

      fireEvent.click(within(cellsOf(taskRow("提案書")).menu).getByLabelText("行メニュー"));
      fireEvent.click(screen.getByText("ハイライトを外す"));

      expect(onToggleHighlight).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    });

    it("行メニューの OFF の行では「ハイライト」と出してトグルする", () => {
      const { onToggleHighlight } = renderRow({
        task: task({ id: 7, name: "提案書", highlighted: false }),
      });

      fireEvent.click(within(cellsOf(taskRow("提案書")).menu).getByLabelText("行メニュー"));
      fireEvent.click(screen.getByText("ハイライト"));

      expect(onToggleHighlight).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    });
  });

  describe("モード色（F-401）", () => {
    it("行全体のテキスト色に反映する", () => {
      renderRow({ task: task({ id: 1, name: "朝食", modeId: 1 }), mode: modeOf("仕事") });

      expect(taskRow("朝食").style.color).toBe(colorOf("仕事"));
    });

    it("モード未設定なら既定の文字色のまま（色を指定しない）", () => {
      renderRow({ task: task({ id: 1, name: "朝食" }) });

      expect(taskRow("朝食").style.color).toBe("");
    });

    // グレーにする範囲は §3.3「モード未設定行の色」が正——モード・プロジェクト・セクションの
    // 併記・実績・実施時間が対象で、タスク名と見積は既定の文字色のまま
    it("モード未設定の行は対象セルすべてを副次情報の色にする（§3.3「モード未設定行の色」）", () => {
      renderRow({ task: task({ id: 1, name: "朝食", estimateMinutes: 20, sectionId: 100 }) });

      const { name, project, mode, estimate, actual, time } = cellsOf(taskRow("朝食"));
      for (const cell of [project, mode, actual, time]) {
        expect(cell.classList.contains("text-ink-muted")).toBe(true);
      }
      // タスク名セルに併記されるセクション名も対象
      expect(within(name).getByText("朝").classList.contains("text-ink-muted")).toBe(true);
      // 見積は対象外（未設定に専用の薄い表記があるため。00_共通 §2.4）。タスク名も主情報なので対象外
      expect(estimate.classList.contains("text-ink-muted")).toBe(false);
      expect(within(name).getByText("朝食").classList.contains("text-ink-muted")).toBe(false);
    });

    it("モード設定済みの行はどこにもグレーを付けない（モード色を効かせる。F-401）", () => {
      renderRow({
        task: task({ id: 1, name: "朝食", modeId: 1, sectionId: 100 }),
        mode: modeOf("仕事"),
      });

      const { name, project, mode, actual, time } = cellsOf(taskRow("朝食"));
      for (const cell of [project, mode, actual, time]) {
        expect(cell.classList.contains("text-ink-muted")).toBe(false);
      }
      expect(within(name).getByText("朝").classList.contains("text-ink-muted")).toBe(false);
    });
  });

  describe("打刻ボタン（F-201）", () => {
    it("押すと打刻し、その行を選択する", () => {
      const { onPunch, onSelect } = renderRow({ task: task({ id: 5, name: "日次プラン" }) });

      fireEvent.click(within(cellsOf(taskRow("日次プラン")).punch).getByRole("button"));

      expect(onPunch).toHaveBeenCalledOnce();
      expect(onPunch.mock.calls[0][0].id).toBe(5);
      // 行クリックの再選択が終了打刻後の選択送り（F-211）を上書きしないよう、選択は1回だけ
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith(5);
    });
  });

  describe("インライン編集（00_共通 §2.3）", () => {
    it("タスク名のクリックで編集を始める", () => {
      const { onBeginEdit } = renderRow({ task: task({ id: 1, name: "朝食" }) });

      fireEvent.click(screen.getByText("朝食"));

      expect(onBeginEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "name");
    });

    it("編集中は現在の値を初期値に入れる", () => {
      renderRow({ editing: "name", task: task({ id: 1, name: "朝食" }) });

      expect(screen.getByRole("textbox")).toHaveProperty("value", "朝食");
    });

    it("入力欄から離れたら確定する（§2.3「確定」）", () => {
      const { onRename, onEndEdit } = renderRow({
        editing: "name",
        task: task({ id: 1, name: "朝食" }),
      });

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "朝ごはん" } });
      fireEvent.blur(input);

      expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "朝ごはん");
      expect(onEndEdit).toHaveBeenCalledOnce();
    });

    it("Enter でも確定する（§2.3「確定」）", () => {
      const { onRename, onEndEdit } = renderRow({
        editing: "name",
        task: task({ id: 1, name: "朝食" }),
      });

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "朝ごはん" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "朝ごはん");
      expect(onEndEdit).toHaveBeenCalledOnce();
    });

    it("Esc は取消（値を送らずに閉じる。§2.3「取消」）", () => {
      const { onRename, onEndEdit } = renderRow({
        editing: "name",
        task: task({ id: 1, name: "朝食" }),
      });

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "朝ごはん" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(onRename).not.toHaveBeenCalled();
      expect(onEndEdit).toHaveBeenCalledOnce();
    });

    it("IME変換中の Enter / Esc は操作として扱わない（00_共通 §3）", () => {
      const { onRename, onEndEdit } = renderRow({
        editing: "name",
        task: task({ id: 1, name: "朝食" }),
      });

      const input = screen.getByRole("textbox");
      fireEvent.keyDown(input, { key: "Enter", isComposing: true });
      fireEvent.keyDown(input, { key: "Escape", isComposing: true });

      expect(onRename).not.toHaveBeenCalled();
      expect(onEndEdit).not.toHaveBeenCalled();
    });

    it("編集は行内の1セルだけに効く（他のセルは表示のまま残る）", () => {
      renderRow({
        editing: "name",
        task: task({ id: 1, name: "朝食", estimateMinutes: 20 }),
      });

      // 見積もりは編集入力に変わらない
      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      const row = screen.getByRole("textbox").closest("tr") as HTMLElement;
      expect(within(cellsOf(row).estimate).queryByText("0:20")).not.toBeNull();
    });

    // 打刻の初期値は行トップで導出する（`editingPunchAt`）ため、打刻を持つ行で
    // 他のセルを編集しても実施時間セルが入力欄に化けないことを併せて見る
    it("打刻済みの行でも編集は1セルだけに効く（実施時間セルは表示のまま残る）", () => {
      renderRow({
        editing: "name",
        task: task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      });

      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      const row = screen.getByRole("textbox").closest("tr") as HTMLElement;
      expect(within(cellsOf(row).time).getAllByRole("button").map((b) => b.textContent)).toEqual([
        "06:30",
        "06:48",
      ]);
    });

    it("見積もりは分の整数で編集する（F-103）", () => {
      const { onEstimate, onEndEdit } = renderRow({
        editing: "estimate",
        task: task({ id: 1, name: "朝食", estimateMinutes: 20 }),
      });

      const input = screen.getByRole("textbox");
      expect(input).toHaveProperty("value", "20");

      fireEvent.change(input, { target: { value: "45" } });
      fireEvent.blur(input);

      expect(onEstimate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "45");
      expect(onEndEdit).toHaveBeenCalledOnce();
    });

    it("見積もり未設定（0分）の編集は空欄から始める（`0` を消す手間を作らない）", () => {
      renderRow({
        editing: "estimate",
        task: task({ id: 1, name: "朝食", estimateMinutes: 0 }),
      });

      expect(screen.getByRole("textbox")).toHaveProperty("value", "");
    });

    it("見積もりセルのクリックで編集を始める", () => {
      const { onBeginEdit } = renderRow({
        task: task({ id: 1, name: "朝食", estimateMinutes: 20 }),
      });

      fireEvent.click(within(cellsOf(taskRow("朝食")).estimate).getByText("0:20"));

      expect(onBeginEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "estimate");
    });

    describe("打刻時刻の修正（F-203）", () => {
      const completed = task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") });

      it("開始時刻・終了時刻それぞれのクリックで編集を始める", () => {
        const { onBeginEdit } = renderRow({ task: completed });

        fireEvent.click(screen.getByText("06:30"));
        expect(onBeginEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "startedAt");

        fireEvent.click(screen.getByText("06:48"));
        expect(onBeginEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "endedAt");
      });

      it("未打刻のタスクは時刻を編集させない", () => {
        renderRow({ task: task({ id: 1, name: "日次プラン", estimateMinutes: 15 }) });

        const { time } = cellsOf(taskRow("日次プラン"));
        expect(time.querySelector("button")).toBeNull();
      });

      // 打刻済みの時刻だけを修正できる（§3.3）。`B`/`F` 側も同じ条件で編集状態に入らない
      // （use-daily-shortcuts。FB-68）ので、ここは行側の受け止めを固定する
      it("未実行タスクは開始時刻の編集状態でも入力欄を出さない", () => {
        renderRow({
          editing: "startedAt",
          task: task({ id: 1, name: "日次プラン", estimateMinutes: 15 }),
        });

        expect(screen.queryByRole("textbox")).toBeNull();
      });

      it("編集を始めたときは既存の値を全選択する（打ち直しが前提のため。FB-23）", () => {
        renderRow({ editing: "startedAt", task: completed });

        const input = screen.getByRole("textbox") as HTMLInputElement;
        expect(input.value).toBe("06:30");

        fireEvent.focus(input);
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe("06:30".length);
      });

      it("区切り文字なしの入力をそのまま渡す（整形は受け取り側が担う）", () => {
        const { onEditPunch, onEndEdit } = renderRow({
          editing: "startedAt",
          task: completed,
        });

        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "1210" } });
        fireEvent.blur(input);

        expect(onEditPunch).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "startedAt", "1210");
        expect(onEndEdit).toHaveBeenCalledOnce();
      });

      it("終了時刻の編集は終了時刻を初期値にし、終了時刻として確定する（開始と取り違えない）", () => {
        const { onEditPunch, onEndEdit } = renderRow({ editing: "endedAt", task: completed });

        const input = screen.getByRole("textbox");
        expect(input).toHaveProperty("value", "06:48");

        fireEvent.change(input, { target: { value: "0930" } });
        fireEvent.blur(input);

        expect(onEditPunch).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "endedAt", "0930");
        expect(onEndEdit).toHaveBeenCalledOnce();
      });

      it("実行中タスクは終了時刻の編集状態でも入力欄を出さない（§3.3: 修正できるのは打刻済みの時刻だけ）", () => {
        renderRow({
          editing: "endedAt",
          task: task({ id: 1, name: "メール", startedAt: atJst("08:05") }),
        });

        expect(screen.queryByRole("textbox")).toBeNull();
      });

      it("実行中タスクは終了時刻のクリック入口を出さない（開始時刻だけ押せる）", () => {
        renderRow({ task: task({ id: 1, name: "メール", startedAt: atJst("08:05") }) });

        const { time } = cellsOf(taskRow("メール"));
        expect(within(time).getAllByRole("button").map((b) => b.textContent)).toEqual(["08:05"]);
      });
    });
  });

  describe("セクションの併記（O-5 / §4.3）", () => {
    it("タスク名の右にセクション名を併記し、クリックで選択を開く", () => {
      const { onBeginEdit } = renderRow({ task: task({ id: 1, name: "朝食", sectionId: 100 }) });

      const { name } = cellsOf(taskRow("朝食"));
      const sectionButton = within(name).getByText("朝");
      fireEvent.click(sectionButton);

      expect(onBeginEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "section");
    });

    it("セクション未指定の行は「未分類」と併記する", () => {
      renderRow({ task: task({ id: 1, name: "買い出しメモ" }) });

      expect(within(cellsOf(taskRow("買い出しメモ")).name).queryByText("未分類")).not.toBeNull();
    });

    it("タスク名を編集中はセクションの併記を隠す（入力欄に集中させる）", () => {
      renderRow({ editing: "name", task: task({ id: 1, name: "朝食", sectionId: 100 }) });

      const nameCell = screen.getByRole("textbox").closest("td") as HTMLElement;
      expect(within(nameCell).queryByText("朝")).toBeNull();
    });

    // 隠す対象はセクション併記とコメント印の2つ（§3.3）。片方だけ残ると入力欄の右に印が浮く
    it("タスク名を編集中はコメントの印も隠す（§3.3 / F-206）", () => {
      renderRow({
        editing: "name",
        task: task({ id: 1, name: "朝食", sectionId: 100, comment: "パンが切れていた" }),
      });

      expect(screen.queryByLabelText("コメントを編集")).toBeNull();
    });

    it("コメントの印はセクション併記の右に置く（§3.3 の並び）", () => {
      renderRow({
        task: task({ id: 1, name: "朝食", sectionId: 100, comment: "パンが切れていた" }),
      });

      const nameCell = cellsOf(taskRow("朝食")).name;
      const section = within(nameCell).getByText("朝");
      const mark = within(nameCell).getByLabelText("コメントを編集");
      // DOM 順で「セクション併記 → 印」（Node.DOCUMENT_POSITION_FOLLOWING = 4）
      expect(section.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe("モード・プロジェクトの選択（O-5）", () => {
    it("モードの候補は「未設定」＋有効モードのみ（アーカイブ済みは出さない。画面定義書03 §4）", () => {
      const { onAssign } = renderRow({
        editing: "mode",
        task: task({ id: 1, name: "朝食", modeId: 1 }),
        mode: modeOf("仕事"),
      });

      expect(popoverLabels()).toEqual(["未設定", "仕事", "生活"]);
      // 現在値として渡すのは `task.modeId`（プロジェクトの id と取り違えていない）
      expect(checkedPopoverLabels()).toEqual(["仕事"]);

      fireEvent.click(screen.getByText("生活"));
      expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "mode", 2);
    });

    it("プロジェクトの候補は「未設定」＋有効プロジェクトのみ", () => {
      const { onAssign } = renderRow({
        editing: "project",
        // モードとは別の id を持たせ、現在値として渡す id を取り違えていないことも見る
        task: task({ id: 1, name: "朝食", projectId: 11, modeId: 1 }),
        mode: modeOf("仕事"),
      });

      expect(popoverLabels()).toEqual(["未設定", "サイト改善"]);
      expect(checkedPopoverLabels()).toEqual(["サイト改善"]);

      fireEvent.click(screen.getByText("サイト改善"));
      expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "project", 11);
    });

    it("「未設定」を選ぶと割り当てを外す", () => {
      const { onAssign } = renderRow({
        editing: "mode",
        task: task({ id: 1, name: "朝食", modeId: 1 }),
        mode: modeOf("仕事"),
      });

      fireEvent.click(screen.getByText("未設定"));

      expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "mode", null);
    });

    it("セルのクリックが選択の入口になる（§3.3「割り当ての入口はセルのクリック」）", () => {
      const { onBeginEdit } = renderRow({ task: task({ id: 1, name: "朝食" }) });
      const { project, mode } = cellsOf(taskRow("朝食"));

      fireEvent.click(within(project).getByRole("button"));
      expect(onBeginEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "project");

      fireEvent.click(within(mode).getByRole("button"));
      expect(onBeginEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "mode");
    });
  });

  describe("行メニュー（O-7 / O-8 / O-12）", () => {
    function openMenu(row: HTMLElement) {
      fireEvent.click(within(cellsOf(row).menu).getByLabelText("行メニュー"));
    }

    it("未実行タスクでは先送りができ、中断はできない（F-107 / F-204）", () => {
      renderRow({ task: task({ id: 1, name: "日次プラン" }) });
      openMenu(taskRow("日次プラン"));

      expect((screen.getByText("翌日へ先送り") as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByText("中断") as HTMLButtonElement).disabled).toBe(true);
    });

    it("実行中タスクでは中断ができ、先送りはできない", () => {
      renderRow({ task: task({ id: 1, name: "メール", startedAt: atJst("08:05") }) });
      openMenu(taskRow("メール"));

      expect((screen.getByText("中断") as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByText("翌日へ先送り") as HTMLButtonElement).disabled).toBe(true);
    });

    it("完了タスクでは中断も先送りもできない（複製はできる）", () => {
      renderRow({
        task: task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      });
      openMenu(taskRow("朝食"));

      expect((screen.getByText("中断") as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByText("翌日へ先送り") as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByText("複製") as HTMLButtonElement).disabled).toBe(false);
    });

    it("ルーチン由来のタスクはルーチン化を非活性で見せる（§4.1 / FB-30）", () => {
      renderRow({ task: task({ id: 1, name: "朝食", routineId: 9 }) });
      openMenu(taskRow("朝食"));

      expect((screen.getByText("ルーチン化") as HTMLButtonElement).disabled).toBe(true);
    });

    it("中断を選ぶと suspend で通知する（O-4 / F-204）", () => {
      const { onOperate } = renderRow({
        task: task({ id: 1, name: "メール", startedAt: atJst("08:05") }),
      });
      openMenu(taskRow("メール"));

      fireEvent.click(screen.getByText("中断"));

      expect(onOperate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "suspend");
    });

    it("複製を選ぶと duplicate で通知する（O-11 / F-111）", () => {
      const { onOperate } = renderRow({ task: task({ id: 1, name: "朝食" }) });
      openMenu(taskRow("朝食"));

      fireEvent.click(screen.getByText("複製"));

      expect(onOperate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "duplicate");
    });

    it("先送りを選ぶと postpone で通知する（O-7 / F-107。行メニューからのみ実行できる）", () => {
      const { onOperate } = renderRow({ task: task({ id: 1, name: "日次プラン" }) });
      openMenu(taskRow("日次プラン"));

      fireEvent.click(screen.getByText("翌日へ先送り"));

      expect(onOperate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "postpone");
    });

    it("未実行タスクの削除は確認を挟まない（O-8: 即削除＋Undoトースト）", () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { onOperate } = renderRow({ task: task({ id: 1, name: "日次プラン" }) });
      openMenu(taskRow("日次プラン"));

      fireEvent.click(screen.getByText("削除"));

      expect(confirm).not.toHaveBeenCalled();
      expect(onOperate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "delete");
    });

    it("打刻済みタスクの削除は確認を挟む（O-8）", () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { onOperate } = renderRow({
        task: task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      });
      openMenu(taskRow("朝食"));

      fireEvent.click(screen.getByText("削除"));

      expect(confirm).toHaveBeenCalledWith("「朝食」は打刻済みです。削除しますか？");
      expect(onOperate).not.toHaveBeenCalled();
    });

    it("ルーチン化を選ぶとポップオーバーを開く（O-12）", () => {
      const { onBeginEdit } = renderRow({ task: task({ id: 1, name: "朝食" }) });
      openMenu(taskRow("朝食"));

      fireEvent.click(screen.getByText("ルーチン化"));

      expect(onBeginEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "routinize");
    });

    it("ルーチン化ポップオーバーの作成で通知し、編集を閉じる（§4.1）", () => {
      const { onRoutinize, onEndEdit } = renderRow({
        editing: "routinize",
        task: task({ id: 1, name: "朝食", estimateMinutes: 20, sectionId: 100 }),
      });

      fireEvent.click(screen.getByText("作成"));

      expect(onRoutinize).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        // 既定は毎日・開始想定はセクション開始時刻（§4.1）
        expect.objectContaining({ recurrenceType: "daily", scheduledStartTime: "06:00" })
      );
      expect(onEndEdit).toHaveBeenCalledOnce();
    });
  });
});

// 帯は `bundle` が渡されているかだけで決まる（隣接は見ない——「つながり」ではなく
// 「この行はこのバンドルの一員」の印。隣り合う行がつながって見えるかは daily-list.test.tsx）
describe("バンドルの道（画面定義書01 §3.3 / F-119）", () => {
  const morningBundle = bundleOf("朝の立上げ");

  it("バンドルに属する行の最左端に、バンドル色の縦帯を出す", () => {
    renderRow({ task: task({ id: 1, name: "ラジオ体操", bundleId: 5 }), bundle: morningBundle });

    expect(screen.getByTestId("bundle-road").style.backgroundColor).toBe(
      bundleColorOf("朝の立上げ")
    );
  });

  it("バンドルに属さない行には帯を出さない", () => {
    renderRow({ task: task({ id: 1, name: "単発タスク", bundleId: null }), bundle: null });

    expect(screen.queryByTestId("bundle-road")).toBeNull();
  });

  it("完了行にも帯を出す（状態を問わない）", () => {
    renderRow({
      task: task({
        id: 1,
        name: "完了タスク",
        bundleId: 5,
        startedAt: atJst("06:00"),
        endedAt: atJst("06:10"),
      }),
      bundle: morningBundle,
    });

    expect(screen.queryByTestId("bundle-road")).not.toBeNull();
  });

  it("未来日にも帯を出す（日付を問わない）", () => {
    renderRow({
      task: task({ id: 1, name: "未来のタスク", bundleId: 5 }),
      bundle: morningBundle,
      isFutureDate: true,
    });

    expect(screen.queryByTestId("bundle-road")).not.toBeNull();
  });

  it("帯を読み上げにバンドル名で出す", () => {
    renderRow({ task: task({ id: 1, name: "ラジオ体操", bundleId: 5 }), bundle: morningBundle });

    // role="img" を持たない素の span（role=generic）は aria-label が禁止属性（axe-core
    // aria-prohibited-attr）で読み上げに反映されない。`getByRole` の `name` オプションは
    // アクセシブル名を計算してマッチするので、role が無い/aria-label が効いていなければ
    // このクエリ自体が失敗する（role="img" を外すと落ちるテストになる）
    const road = screen.getByRole("img", { name: "朝の立上げ" });
    expect(road).toBe(screen.getByTestId("bundle-road"));
  });

  it("帯に乗せた瞬間にバンドル名を吹き出しで出し、離すと消す（§3.3）", () => {
    renderRow({ task: task({ id: 1, name: "ラジオ体操", bundleId: 5 }), bundle: morningBundle });

    // 標準の `title` は表示までに間があるので使わない。属性が残っていると吹き出しと
    // 二重に出るため、無いことも併せて見る
    const road = screen.getByTestId("bundle-road");
    expect(road.getAttribute("title")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(road);
    expect(screen.getByRole("tooltip").textContent).toBe("朝の立上げ");

    fireEvent.mouseLeave(road);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("帯は打刻ボタンより外側（最左端の専用列）に置く", () => {
    renderRow({ task: task({ id: 1, name: "ラジオ体操", bundleId: 5 }), bundle: morningBundle });

    // `cellsOf` は列を添字で名付けるので、**それぞれの列が期待の中身を持つ**ことで並びを見る
    const { road, punch } = cellsOf(taskRow("ラジオ体操"));
    expect(within(road).queryByTestId("bundle-road")).not.toBeNull();
    expect(within(punch).queryByLabelText("開始")).not.toBeNull();
  });
});
