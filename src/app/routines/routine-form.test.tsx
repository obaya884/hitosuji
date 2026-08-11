import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Bundle } from "@/domain/bundle/bundle";
import type { RoutineInput } from "@/domain/routine/input";
import type { Routine } from "@/domain/routine/routine";

import { routine } from "@/domain/routine/testing/routine";
import { BUNDLES, MODES, PROJECTS, TODAY } from "./_testing/fixtures";
import { RoutineForm } from "./routine-form";

/** 新規（routine=null）と編集（routine あり）で同じフォームを使う（§4「新規/編集共通」） */
function setup(
  target: Routine | null = null,
  { isPending = false, bundles = BUNDLES }: Readonly<{ isPending?: boolean; bundles?: readonly Bundle[] }> = {}
) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <RoutineForm
      routine={target}
      bundles={bundles}
      modes={MODES}
      projects={PROJECTS}
      today={TODAY}
      isPending={isPending}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
  return { onSubmit, onCancel };
}

const save = () => fireEvent.click(screen.getByText("保存"));

/** 新規フォームの既定値（§4）。各テストは差分だけを述べる */
const DEFAULT_INPUT: RoutineInput = {
  name: "",
  estimateMinutes: 15,
  scheduledStartTime: "09:00",
  modeId: null,
  projectId: null,
  bundleId: null,
  recurrenceType: "daily",
  weekdays: null,
  weekInterval: null,
  monthDay: null,
  intervalDays: null,
  startDate: TODAY,
  endDate: null,
};

// 曜日ビットマスクは bit0=月 … bit6=日（データモデル定義書 §3.4）
const WEEKDAYS_MON_TO_FRI = 0b0011111;
const WEEKDAYS_SAT_SUN = 0b1100000;

describe("RoutineForm（画面定義書02 §4: 繰り返し種別に応じて入力項目を出し分ける新規/編集フォーム）", () => {
  it("新規は既定値で開く（見積15分・開始想定09:00・毎日・開始日=今日・終了日なし・モード/プロジェクト未設定）", () => {
    const { onSubmit } = setup();

    expect(screen.getByLabelText<HTMLInputElement>("名前").value).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>("見積もり（分）").value).toBe("15");
    expect(screen.getByLabelText<HTMLInputElement>("開始想定時刻").value).toBe("09:00");
    expect(screen.getByLabelText<HTMLInputElement>("毎日").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("開始日").value).toBe(TODAY);
    expect(screen.getByLabelText<HTMLInputElement>("終了日（任意）").value).toBe("");

    save();

    expect(onSubmit).toHaveBeenCalledWith(DEFAULT_INPUT);
  });

  it("編集は既存の値を埋める（週次・曜日・週間隔・終了日）", () => {
    setup(
      routine({
        id: 1,
        name: "週次の見直し",
        estimateMinutes: 45,
        scheduledStartTime: "10:30",
        recurrenceType: "weekly",
        weekdays: 0b0000010, // 火
        weekInterval: 2,
        startDate: "2026-06-01",
        endDate: "2026-09-30",
        modeId: 2,
        projectId: 12,
      })
    );

    expect(screen.getByLabelText<HTMLInputElement>("名前").value).toBe("週次の見直し");
    expect(screen.getByLabelText<HTMLInputElement>("見積もり（分）").value).toBe("45");
    expect(screen.getByLabelText<HTMLInputElement>("開始想定時刻").value).toBe("10:30");
    expect(screen.getByLabelText<HTMLInputElement>("週次").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("火").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("月").checked).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>(/週間隔/).value).toBe("2");
    expect(screen.getByLabelText<HTMLInputElement>("開始日").value).toBe("2026-06-01");
    expect(screen.getByLabelText<HTMLInputElement>("終了日（任意）").value).toBe("2026-09-30");
    expect(screen.getByLabelText<HTMLSelectElement>("モード").value).toBe("2");
    expect(screen.getByLabelText<HTMLSelectElement>("プロジェクト").value).toBe("12");
  });

  // 新規の既定は月次=1日・n日ごと=2日。既定値を出してしまうと編集で値が化けるため、
  // 週次（上のテスト）と同じく既存値が埋まることを種別ごとに固定する
  it("編集は既存の値を埋める（月次の日）", () => {
    setup(routine({ id: 1, recurrenceType: "monthly", monthDay: 25 }));

    expect(screen.getByLabelText<HTMLInputElement>("月次").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(/月末に丸めます/).value).toBe("25");
  });

  it("編集は既存の値を埋める（n日ごとの間隔）", () => {
    setup(routine({ id: 1, recurrenceType: "interval", intervalDays: 3 }));

    expect(screen.getByLabelText<HTMLInputElement>("n日ごと").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(/開始日が起算日/).value).toBe("3");
  });

  it("入力した値をそのまま送る（名前・見積・開始想定時刻・開始日・終了日）", () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "点検" } });
    fireEvent.change(screen.getByLabelText("見積もり（分）"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("開始想定時刻"), { target: { value: "06:30" } });
    fireEvent.change(screen.getByLabelText("開始日"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("終了日（任意）"), { target: { value: "2026-09-30" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith({
      ...DEFAULT_INPUT,
      name: "点検",
      estimateMinutes: 45,
      scheduledStartTime: "06:30",
      startDate: "2026-08-01",
      endDate: "2026-09-30",
    });
  });

  it("毎日は曜日・週間隔・日・間隔の入力を出さない", () => {
    setup();

    expect(screen.queryByLabelText("月")).toBeNull();
    expect(screen.queryByLabelText(/週間隔/)).toBeNull();
    expect(screen.queryByLabelText(/月末に丸めます/)).toBeNull();
    expect(screen.queryByLabelText(/開始日が起算日/)).toBeNull();
  });

  it("週次のときだけ曜日（7つ）と週間隔（1〜53）を出す", () => {
    setup();

    fireEvent.click(screen.getByLabelText("週次"));

    for (const label of ["月", "火", "水", "木", "金", "土", "日"]) {
      expect(screen.getByLabelText<HTMLInputElement>(label).type).toBe("checkbox");
    }
    const interval = screen.getByLabelText<HTMLInputElement>(/週間隔/);
    expect(interval.min).toBe("1");
    expect(interval.max).toBe("53");
    expect(screen.queryByLabelText(/月末に丸めます/)).toBeNull();
    expect(screen.queryByLabelText(/開始日が起算日/)).toBeNull();
  });

  it("月次のときだけ日（1〜31）を出す", () => {
    setup();

    fireEvent.click(screen.getByLabelText("月次"));

    const monthDay = screen.getByLabelText<HTMLInputElement>(/月末に丸めます/);
    expect(monthDay.min).toBe("1");
    expect(monthDay.max).toBe("31");
    expect(screen.queryByLabelText("月")).toBeNull();
    expect(screen.queryByLabelText(/週間隔/)).toBeNull();
    expect(screen.queryByLabelText(/開始日が起算日/)).toBeNull();
  });

  it("n日ごとのときだけ間隔（1日以上）を出す", () => {
    setup();

    fireEvent.click(screen.getByLabelText("n日ごと"));

    const intervalDays = screen.getByLabelText<HTMLInputElement>(/開始日が起算日/);
    expect(intervalDays.min).toBe("1");
    expect(screen.queryByLabelText("月")).toBeNull();
    expect(screen.queryByLabelText(/週間隔/)).toBeNull();
    expect(screen.queryByLabelText(/月末に丸めます/)).toBeNull();
  });

  it("プリセット「平日」は月〜金だけを選択した状態にする", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("週次"));
    fireEvent.click(screen.getByText("平日"));

    expect(screen.getByLabelText<HTMLInputElement>("金").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("土").checked).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>("日").checked).toBe(false);

    save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ weekdays: WEEKDAYS_MON_TO_FRI })
    );
  });

  it("プリセット「土日」は土日だけを選択した状態にする（前の選択は残さない）", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("週次"));
    fireEvent.click(screen.getByText("平日"));
    fireEvent.click(screen.getByText("土日"));

    expect(screen.getByLabelText<HTMLInputElement>("月").checked).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>("土").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("日").checked).toBe(true);

    save();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ weekdays: WEEKDAYS_SAT_SUN }));
  });

  it("プリセットを押したあと個別のチェックで微調整できる", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("週次"));
    fireEvent.click(screen.getByText("平日"));
    fireEvent.click(screen.getByLabelText("土"));

    save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ weekdays: WEEKDAYS_MON_TO_FRI | (1 << 5) })
    );
  });

  it("曜日チェックは押し直すと外れる", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("週次"));
    fireEvent.click(screen.getByLabelText("水"));
    expect(screen.getByLabelText<HTMLInputElement>("水").checked).toBe(true);

    fireEvent.click(screen.getByLabelText("水"));
    expect(screen.getByLabelText<HTMLInputElement>("水").checked).toBe(false);

    save();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ weekdays: 0 }));
  });

  it("繰り返し種別に関係しない項目は null にして送る（週次→月次で曜日・週間隔の残骸を残さない）", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("週次"));
    fireEvent.click(screen.getByText("平日"));
    fireEvent.change(screen.getByLabelText(/週間隔/), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("月次"));
    fireEvent.change(screen.getByLabelText(/月末に丸めます/), { target: { value: "25" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith({
      ...DEFAULT_INPUT,
      recurrenceType: "monthly",
      weekdays: null,
      weekInterval: null,
      monthDay: 25,
      intervalDays: null,
    });
  });

  // 種別を切り替えただけで保存したときに何が送られるか（§4「週間隔 … 既定1」ほか）。
  // 明示入力の経路とは別に、既定値そのものを固定する
  it("週次に切り替えただけなら週間隔は既定の1で送る（曜日は未選択の 0 のまま）", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("週次"));
    expect(screen.getByLabelText<HTMLInputElement>(/週間隔/).value).toBe("1");

    save();

    expect(onSubmit).toHaveBeenCalledWith({
      ...DEFAULT_INPUT,
      recurrenceType: "weekly",
      weekdays: 0,
      weekInterval: 1,
      monthDay: null,
      intervalDays: null,
    });
  });

  it("月次に切り替えただけなら日は既定の1で送る", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("月次"));
    expect(screen.getByLabelText<HTMLInputElement>(/月末に丸めます/).value).toBe("1");

    save();

    expect(onSubmit).toHaveBeenCalledWith({
      ...DEFAULT_INPUT,
      recurrenceType: "monthly",
      weekdays: null,
      weekInterval: null,
      monthDay: 1,
      intervalDays: null,
    });
  });

  it("n日ごとに切り替えただけなら間隔は既定の2で送る", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("n日ごと"));
    expect(screen.getByLabelText<HTMLInputElement>(/開始日が起算日/).value).toBe("2");

    save();

    expect(onSubmit).toHaveBeenCalledWith({
      ...DEFAULT_INPUT,
      recurrenceType: "interval",
      weekdays: null,
      weekInterval: null,
      monthDay: null,
      intervalDays: 2,
    });
  });

  it("週次は曜日と週間隔だけを送る（日・間隔は null）", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("週次"));
    fireEvent.click(screen.getByText("土日"));
    fireEvent.change(screen.getByLabelText(/週間隔/), { target: { value: "2" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith({
      ...DEFAULT_INPUT,
      recurrenceType: "weekly",
      weekdays: WEEKDAYS_SAT_SUN,
      weekInterval: 2,
      monthDay: null,
      intervalDays: null,
    });
  });

  it("n日ごとは間隔だけを送る（曜日・週間隔・日は null）", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByLabelText("n日ごと"));
    fireEvent.change(screen.getByLabelText(/開始日が起算日/), { target: { value: "3" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith({
      ...DEFAULT_INPUT,
      recurrenceType: "interval",
      weekdays: null,
      weekInterval: null,
      monthDay: null,
      intervalDays: 3,
    });
  });

  it("終了日は省略可（空欄は無期限＝null として送る）", () => {
    const { onSubmit } = setup(routine({ id: 1, endDate: "2026-09-30" }));

    fireEvent.change(screen.getByLabelText("終了日（任意）"), { target: { value: "" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ endDate: null }));
  });

  it("モード・プロジェクトは選択肢に「未設定」を持ち、選ぶと id で送る", () => {
    const { onSubmit } = setup();

    const mode = screen.getByLabelText<HTMLSelectElement>("モード");
    const project = screen.getByLabelText<HTMLSelectElement>("プロジェクト");
    // 語は全画面共通（画面定義書00 §2.4）。直上の項目ラベルと重ねないため属性名を冠さない
    expect([...mode.options].map((o) => o.textContent)).toEqual(["未設定", "モードA", "モードB"]);
    expect([...project.options].map((o) => o.textContent)).toEqual(["未設定", "案件A", "案件B"]);

    fireEvent.change(mode, { target: { value: "1" } });
    fireEvent.change(project, { target: { value: "12" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ modeId: 1, projectId: 12 })
    );
  });

  it("モード・プロジェクトは「未設定」に戻せる", () => {
    const { onSubmit } = setup(routine({ id: 1, modeId: 1, projectId: 11 }));

    fireEvent.change(screen.getByLabelText("モード"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("プロジェクト"), { target: { value: "" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ modeId: null, projectId: null })
    );
  });

  // アーカイブ済みを候補から外すのは `routines/page.tsx`（`bundleView.active` を渡す）の責務で、
  // このフォームは渡された候補をそのまま並べる（モード・プロジェクトと同じ扱い。画面定義書02 §4）
  it("バンドルは選択肢に「未設定」＋渡された候補を持つ", () => {
    setup(null, { bundles: BUNDLES });

    const bundle = screen.getByLabelText<HTMLSelectElement>("バンドル");
    expect([...bundle.options].map((o) => o.textContent)).toEqual(["未設定", "バンドルA", "バンドルB"]);
  });

  // 別のバンドルに属していても、ここでは付け替えられる（§4。S-05 O-5 と非対称）——
  // 未所属に絞っていないことは、上のテストの期待値（有効なバンドルが全部出る）で固定している
  it("バンドルは「未設定」に戻せる", () => {
    const { onSubmit } = setup(routine({ id: 1, bundleId: 1 }));

    fireEvent.change(screen.getByLabelText("バンドル"), { target: { value: "" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ bundleId: null }));
  });

  // 必須・範囲の判定は domain の validateRoutineInput が行い（アーキテクチャ定義書 §4）、
  // 失敗メッセージは一覧側（RoutinesTable）が Server Action の結果として表示する。
  // フォームは入力を止めないので、空欄でも onSubmit まで届くことを固定する
  it("フォームは検証せず素の値を渡す（名前が空・見積が空でも保存を試みる）", () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByLabelText("見積もり（分）"), { target: { value: "" } });

    save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "", estimateMinutes: 0 })
    );
  });

  it("取消では onCancel だけを呼ぶ（保存はしない）", () => {
    const { onSubmit, onCancel } = setup();

    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "書きかけ" } });
    fireEvent.click(screen.getByText("取消"));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // 00_共通 §2.3「新規追加行・新規作成フォームの保存中」——確定と取消をどちらも止める。
  // 連打は同じルーチンを二重に作り、応答待ちの取消はフォームを閉じて失敗のメッセージだけを残す
  it("保存中は「保存」を押せない（連打で二重に作らせない）", () => {
    const { onSubmit } = setup(null, { isPending: true });

    const button = screen.getByText<HTMLButtonElement>("保存");
    expect(button.disabled).toBe(true);

    save();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("保存中は「取消」を押せない（応答を待つ間に閉じさせない）", () => {
    const { onCancel } = setup(null, { isPending: true });

    const button = screen.getByText<HTMLButtonElement>("取消");
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // 送信せず表示だけを変えるその場の選択も止める（§2.3「保存中に始める操作」）——
  // 保存中に選び直せると、送信済みの値と画面の表示が食い違う
  it("保存中は繰り返し・曜日・モード/プロジェクトの選択を変えられない", () => {
    setup(routine({ id: 7, recurrenceType: "weekly", weekdays: 0b0000010 }), { isPending: true });

    expect(screen.getByLabelText<HTMLInputElement>("毎日").disabled).toBe(true);
    expect(screen.getByText<HTMLButtonElement>("平日").disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("火").disabled).toBe(true);
    expect(screen.getByLabelText<HTMLSelectElement>("モード").disabled).toBe(true);
    expect(screen.getByLabelText<HTMLSelectElement>("プロジェクト").disabled).toBe(true);
  });

  // 一方でテキスト入力は触れるままにする（失敗して戻ってきたときに入力し直せるように。§2.3「失敗時」）
  it("保存中でも名前などのテキスト入力は打てる", () => {
    setup(null, { isPending: true });

    const name = screen.getByLabelText<HTMLInputElement>("名前");
    expect(name.disabled).toBe(false);

    fireEvent.change(name, { target: { value: "打ち直し" } });
    expect(name.value).toBe("打ち直し");
  });
});
