import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { RoutineScheduleError } from "@/domain/routine/routine";
import type { Section } from "@/domain/section/section";
import type { Task } from "@/domain/task/task";

import { ROUTINE_MESSAGES } from "@/app/_lib/error-messages";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { RoutinizePopover } from "./routinize-popover";

// TEST_DATE（= ファクトリ既定の taskDate）は日曜。週次の既定曜日・月次の既定日はここから決まる
const SECTIONS: readonly Section[] = [
  { id: 10, name: "朝", startTime: "06:00", isArchived: false, isDayStart: true },
  { id: 20, name: "午前", startTime: "09:00", isArchived: false },
  { id: 30, name: "午後", startTime: "13:00", isArchived: false },
];

type Overrides = Readonly<{
  task?: Task;
  sections?: readonly Section[];
  now?: Date;
  onSubmit?: (choice: RoutineFromTaskChoice) => void;
  onClose?: () => void;
}>;

function renderPopover(overrides: Overrides = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const result = render(
    <RoutinizePopover
      task={overrides.task ?? task({ id: 1 })}
      sections={overrides.sections ?? SECTIONS}
      now={overrides.now ?? atJst("16:15")}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
  return { ...result, onSubmit, onClose };
}

/** ラベル（`開始想定` `週間隔` `日` `日ごと`）と同じ label 要素に置かれた入力欄 */
function inputFor(label: string): HTMLInputElement {
  const wrapper = screen.getByText(label).parentElement as HTMLElement;
  const input = wrapper.querySelector("input");
  if (input === null) throw new Error(`「${label}」の入力欄が見つかりません`);
  return input;
}

/** aria-pressed で押下状態を表すトグル群（繰り返し種別・曜日）のうち押されているもの */
function pressedLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-pressed="true"]')].map((el) => el.textContent ?? "");
}

// 入力させる値は「繰り返し種別と開始想定時刻だけ」（§4.1）。引き継ぐ値の変換は domain の from-task.test.ts が担保する
describe("RoutinizePopover（画面定義書01 §4.1 / O-12: 最小の入力でタスクからルーチンを作る）", () => {
  it("既定は毎日（種別だけが選ばれ、種別ごとの追加入力は出さない）", () => {
    const { container } = renderPopover();

    expect(pressedLabels(container)).toEqual(["毎日"]);
    expect(screen.queryByText("週間隔")).toBeNull();
    expect(screen.queryByText("日ごと")).toBeNull();
  });

  it("繰り返し種別は毎日 / 週次 / 月次 / n日ごと から選べる", () => {
    renderPopover();

    for (const label of ["毎日", "週次", "月次", "n日ごと"]) {
      expect(screen.queryByText(label)).not.toBeNull();
    }
  });

  it("週次を選ぶと曜日・プリセット・週間隔が出て、元タスクの曜日が既定で選ばれる", () => {
    const { container } = renderPopover({ task: task({ id: 1, taskDate: TEST_DATE }) });

    fireEvent.click(screen.getByText("週次"));

    // 2026-07-26 は日曜
    expect(pressedLabels(container)).toEqual(["週次", "日"]);
    expect(screen.queryByText("平日")).not.toBeNull();
    expect(screen.queryByText("土日")).not.toBeNull();
    expect(screen.queryByText("週おき（1=毎週）")).not.toBeNull();
  });

  it("曜日はトグルで増減できる", () => {
    const { container } = renderPopover({ task: task({ id: 1, taskDate: TEST_DATE }) });
    fireEvent.click(screen.getByText("週次"));

    fireEvent.click(screen.getByText("月"));
    expect(pressedLabels(container)).toEqual(["週次", "月", "日"]);

    fireEvent.click(screen.getByText("日"));
    expect(pressedLabels(container)).toEqual(["週次", "月"]);
  });

  it("「平日」プリセットは月〜金だけを選んだ状態にする（画面定義書02 §4 と同じ入力補助）", () => {
    const { container } = renderPopover({ task: task({ id: 1, taskDate: TEST_DATE }) });
    fireEvent.click(screen.getByText("週次"));

    fireEvent.click(screen.getByText("平日"));

    expect(pressedLabels(container)).toEqual(["週次", "月", "火", "水", "木", "金"]);
  });

  it("月次を選ぶと元タスクの日が既定で入る", () => {
    renderPopover({ task: task({ id: 1, taskDate: TEST_DATE }) });

    fireEvent.click(screen.getByText("月次"));

    const day = inputFor("日");
    expect(day.value).toBe("26");
  });

  it("n日ごとの既定は2日", () => {
    renderPopover();

    fireEvent.click(screen.getByText("n日ごと"));

    const interval = inputFor("日ごと");
    expect(interval.value).toBe("2");
  });

  describe("開始想定時刻の既定値（§4.1: 打刻時刻 → セクション開始時刻 → 現在時刻）", () => {
    it("打刻済みならその開始時刻（秒は切り捨て）", () => {
      renderPopover({
        task: task({ id: 1, sectionId: 20, startedAt: new Date("2026-07-26T08:05:45+09:00") }),
      });

      expect(inputFor("開始想定").value).toBe("08:05");
    });

    it("未打刻ならタスクが属するセクションの開始時刻", () => {
      renderPopover({ task: task({ id: 1, sectionId: 30 }) });

      expect(inputFor("開始想定").value).toBe("13:00");
    });

    it("未分類かつ未打刻なら現在時刻", () => {
      renderPopover({
        task: task({ id: 1, sectionId: null }),
        now: atJst("16:15"),
      });

      expect(inputFor("開始想定").value).toBe("16:15");
    });
  });

  it("区切り文字なしの入力を HH:MM へ整形する（§4.1 / F-203）", () => {
    renderPopover();
    const input = inputFor("開始想定");

    fireEvent.change(input, { target: { value: "0805" } });
    fireEvent.blur(input);

    expect(input.value).toBe("08:05");
  });

  it("整形できない入力は blur しても元のまま残す（直せるように。§4.1）", () => {
    renderPopover();
    const input = inputFor("開始想定");

    fireEvent.change(input, { target: { value: "99:99" } });
    fireEvent.blur(input);

    expect(input.value).toBe("99:99");
  });

  it("開始想定時刻から導出されるセクションを付記する（展開先の目安）", () => {
    renderPopover();
    const input = inputFor("開始想定");

    fireEvent.change(input, { target: { value: "10:00" } });

    expect(screen.queryByText("(午前)")).not.toBeNull();
  });

  /**
   * §4.1「入力の検証」: 確定時に予定全体を検証し、不正ならポップオーバーを閉じず中に出す。
   *
   * **期待値は文言を書き写さず共有辞書から引く**（FB-75）——写すと「辞書と同じ文字列を
   * コンポーネントに直書きする」状態がテストからも見えなくなる（＝FB-75 の起票時と同じ形）。
   * 辞書を引いておけば、辞書だけが改訂されて実装の直書きが取り残された時点で赤くなる。
   * 文言そのものの正しさは `error-messages.test.ts` が literal で固定している
   */
  describe("入力の検証（§4.1: 不正なら確定させずポップオーバー内に出す）", () => {
    /**
     * エラーコードごとの「不正な入力を作る手順」。**`Record` で持つのでコードが増えれば
     * ここが型エラーになる**（配列で持つと部分集合でも型が通り、網羅が保証されない）
     */
    const INVALID_INPUTS: Record<
      RoutineScheduleError,
      readonly (readonly [string, () => void])[]
    > = {
      invalid_start_time: [
        [
          "書式が不正",
          () => fireEvent.change(inputFor("開始想定"), { target: { value: "99:99" } }),
        ],
        [
          // domain 側の正規化は先頭5文字の切り出しなので、素通しすると黙って `09:05` になる
          "末尾に余剰がある",
          () => fireEvent.change(inputFor("開始想定"), { target: { value: "09:05x" } }),
        ],
        [
          "秒まで書かれている",
          () => fireEvent.change(inputFor("開始想定"), { target: { value: "12:34:56" } }),
        ],
      ],
      weekdays_required: [
        [
          "週次で曜日を1つも選んでいない",
          () => {
            fireEvent.click(screen.getByText("週次"));
            // 既定で選ばれている元タスクの曜日（日曜）を外す
            fireEvent.click(screen.getByText("日"));
          },
        ],
      ],
      invalid_week_interval: [
        [
          "週間隔が範囲外",
          () => {
            fireEvent.click(screen.getByText("週次"));
            fireEvent.change(inputFor("週間隔"), { target: { value: "54" } });
          },
        ],
      ],
      invalid_month_day: [
        [
          "月次の日が空（0 扱いで範囲外）",
          () => {
            fireEvent.click(screen.getByText("月次"));
            fireEvent.change(inputFor("日"), { target: { value: "" } });
          },
        ],
      ],
      invalid_interval_days: [
        [
          "n日ごとの間隔が範囲外",
          () => {
            fireEvent.click(screen.getByText("n日ごと"));
            fireEvent.change(inputFor("日ごと"), { target: { value: "0" } });
          },
        ],
      ],
    };

    const INVALID_CASES = Object.entries(INVALID_INPUTS).flatMap(([error, cases]) =>
      cases.map(
        ([name, makeInvalid]) => [`${error}: ${name}`, makeInvalid, error] as const
      )
    );

    it.each(INVALID_CASES)("%s", (_name, makeInvalid, error) => {
      // 元タスクの曜日（日曜）が既定で選ばれる日付にそろえる
      const { onSubmit, onClose } = renderPopover({ task: task({ id: 1, taskDate: TEST_DATE }) });
      makeInvalid();

      fireEvent.click(screen.getByText("作成"));

      expect(onSubmit).not.toHaveBeenCalled();
      // 閉じてしまうと親がアンマウントし、出したエラーがユーザーに届かない
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByText(ROUTINE_MESSAGES[error as RoutineScheduleError])).not.toBeNull();
    });

    it("入力を直すとエラーは消える（§4.1: 直した後も古い指摘を残さない）", () => {
      renderPopover();
      fireEvent.change(inputFor("開始想定"), { target: { value: "99:99" } });
      fireEvent.click(screen.getByText("作成"));
      expect(screen.queryByText(ROUTINE_MESSAGES.invalid_start_time)).not.toBeNull();

      fireEvent.change(inputFor("開始想定"), { target: { value: "09:05" } });

      expect(screen.queryByText(ROUTINE_MESSAGES.invalid_start_time)).toBeNull();
    });

    it("入力欄以外の入口（曜日の選び直し）でもエラーは消える", () => {
      renderPopover({ task: task({ id: 1, taskDate: TEST_DATE }) });
      fireEvent.click(screen.getByText("週次"));
      fireEvent.click(screen.getByText("日"));
      fireEvent.click(screen.getByText("作成"));
      expect(screen.queryByText(ROUTINE_MESSAGES.weekdays_required)).not.toBeNull();

      fireEvent.click(screen.getByText("月"));

      expect(screen.queryByText(ROUTINE_MESSAGES.weekdays_required)).toBeNull();
    });

    it("値を直さない blur ではエラーは残る（消えるのは直したときだけ）", () => {
      renderPopover();
      const input = inputFor("開始想定");
      fireEvent.change(input, { target: { value: "99:99" } });
      fireEvent.click(screen.getByText("作成"));

      fireEvent.blur(input);

      expect(screen.queryByText(ROUTINE_MESSAGES.invalid_start_time)).not.toBeNull();
    });

    it("直してから押し直せば作成できる（エラーが確定を塞ぎ続けない）", () => {
      const { onSubmit } = renderPopover();
      fireEvent.change(inputFor("開始想定"), { target: { value: "99:99" } });
      fireEvent.click(screen.getByText("作成"));
      expect(onSubmit).not.toHaveBeenCalled();

      fireEvent.change(inputFor("開始想定"), { target: { value: "09:05" } });
      fireEvent.click(screen.getByText("作成"));

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledStartTime: "09:05" })
      );
    });
  });

  it("作成すると整形済みの時刻と選んだ種別を渡す", () => {
    const { onSubmit } = renderPopover({ task: task({ id: 1, taskDate: TEST_DATE }) });
    fireEvent.click(screen.getByText("週次"));
    fireEvent.change(inputFor("開始想定"), { target: { value: "935" } });

    fireEvent.click(screen.getByText("作成"));

    expect(onSubmit).toHaveBeenCalledWith({
      recurrenceType: "weekly",
      // 日曜（bit6）
      weekdays: 1 << 6,
      weekInterval: 1,
      monthDay: 26,
      intervalDays: 2,
      scheduledStartTime: "09:35",
    });
  });

  it("月次の日を変えるとそのまま渡る", () => {
    const { onSubmit } = renderPopover();
    fireEvent.click(screen.getByText("月次"));

    const day = inputFor("日");
    fireEvent.change(day, { target: { value: "15" } });
    fireEvent.click(screen.getByText("作成"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceType: "monthly", monthDay: 15 })
    );
  });

  it("n日ごとの間隔を変えるとそのまま渡る", () => {
    const { onSubmit } = renderPopover();
    fireEvent.click(screen.getByText("n日ごと"));

    const interval = inputFor("日ごと");
    fireEvent.change(interval, { target: { value: "3" } });
    fireEvent.click(screen.getByText("作成"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceType: "interval", intervalDays: 3 })
    );
  });

  it("週間隔を変えるとそのまま渡る（FB-44: 隔週など）", () => {
    const { onSubmit } = renderPopover();
    fireEvent.click(screen.getByText("週次"));

    const weekInterval = inputFor("週間隔");
    fireEvent.change(weekInterval, { target: { value: "2" } });
    fireEvent.click(screen.getByText("作成"));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ weekInterval: 2 }));
  });

  it("展開は翌日からである旨を示す（§4.1「開始日」）", () => {
    renderPopover();

    expect(screen.queryByText("明日から展開")).not.toBeNull();
  });

  it("Esc で閉じる（00_共通 §2.1）", () => {
    const { onClose } = renderPopover();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("外側のクリックで閉じる（00_共通 §2.1）", () => {
    const { onClose } = renderPopover();

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });
});
