import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { afternoon, morning, unclassifiedGroup } from "../_testing/factories";
import { headingOf } from "../_testing/table-helpers";
import { GroupHeading, type GroupHeadingProps } from "./group-heading";

/** props は `GroupHeadingProps` から派生させる（同じ形を手で写さない） */
function renderHeading(overrides: Partial<GroupHeadingProps> = {}) {
  return render(
    <table>
      <tbody>
        <GroupHeading
          group={overrides.group ?? unclassifiedGroup()}
          // 見出しの `now` はセクション終了（`sectionEndAt`）へ流れる。`APP_TIME_ZONE` 基準
          // なので `atJst` 一本で組める（T-47。実打刻は見出しに出ない）
          now={overrides.now ?? atJst("10:00")}
          isToday={overrides.isToday ?? true}
          dayStartMinutes={overrides.dayStartMinutes ?? 0}
          currentSectionId={overrides.currentSectionId ?? null}
        />
      </tbody>
    </table>
  );
}

// 現在セクションの強調（F-121）は `currentSectionId` の導出とセットで意味を持つため、
// 「10:00 はどのセクションか」まで通す形で daily-list.test.tsx が見る
describe("GroupHeading（画面定義書01 §3.2: セクション見出し行）", () => {
  it("セクション名と時間帯を出す", () => {
    renderHeading({ group: morning([task({ id: 1, name: "朝食" })]) });

    expect(within(headingOf("朝")).queryByText("06:00–09:00")).not.toBeNull();
  });

  it("未分類グループは名前だけで、時間帯・残り時間を出さない（枠を持たない）", () => {
    renderHeading({ group: unclassifiedGroup([task({ id: 1, name: "買い出しメモ" })]) });

    expect(headingOf("未分類").textContent).not.toContain("残り");
    expect(headingOf("未分類").textContent).not.toContain("–");
  });

  it("時間合計は完了は実績・未完了は見積もりを合算する（分母はセクション枠の長さ）", () => {
    renderHeading({
      group: morning([
        // 見積もり20分・実績18分の完了タスク → 実績で数える
        task({ id: 1, name: "朝食", estimateMinutes: 20, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
        // 実行中は見積もりで数える
        task({ id: 2, name: "メール", estimateMinutes: 30, startedAt: atJst("08:05") }),
      ]),
    });

    expect(within(headingOf("朝")).queryByText("0:48")).not.toBeNull();
    expect(within(headingOf("朝")).queryByText("/3:00")).not.toBeNull();
  });

  it("時間合計が0のときは `--:--`（00_共通 §2.4）", () => {
    renderHeading({ group: morning([task({ id: 1, name: "朝食", estimateMinutes: 0 })]) });

    expect(within(headingOf("朝")).queryByText("--:--")).not.toBeNull();
  });

  it("タスク進捗（実施済み/全件）を出す。実行中は実施済みに含めない（F-114）", () => {
    renderHeading({
      group: morning([
        task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
        task({ id: 2, name: "メール", startedAt: atJst("08:05") }),
        task({ id: 3, name: "日次プラン" }),
      ]),
    });

    expect(within(headingOf("朝")).queryByText("1/3")).not.toBeNull();
  });

  it("0件のグループは見出しだけを置き、進捗・時間合計・残り時間を出さない（FB-25/FB-26）", () => {
    renderHeading({ group: morning([]) });

    expect(within(headingOf("朝")).queryByText("06:00–09:00")).not.toBeNull();
    expect(headingOf("朝").textContent).not.toContain("合計");
    expect(headingOf("朝").textContent).not.toContain("0/0");
  });

  it("残り時間は（セクション終了 − 現在）− 未完了見積もり（F-110）", () => {
    renderHeading({
      // セクション終了時刻は論理日の暦日 0:00 起点で測る（起点は JST。T-47）
      now: atJst("07:00"),
      group: morning([task({ id: 1, name: "朝食", estimateMinutes: 30 })]),
    });

    // 07:00 → 09:00 の120分から未完了見積もり30分を引いて +1:30
    expect(headingOf("朝").textContent).toContain("残り");
    expect(within(headingOf("朝")).queryByText("+1:30")).not.toBeNull();
  });

  it("残り時間のマイナスは警告色で示す（FB-31/FB-32: 溢れが読めるように）", () => {
    renderHeading({
      now: atJst("07:00"),
      group: morning([task({ id: 1, name: "朝食", estimateMinutes: 180 })]),
    });

    const remaining = within(headingOf("朝")).queryByText("-1:00");
    expect(remaining).not.toBeNull();
    expect(remaining?.classList.contains("text-danger")).toBe(true);
  });

  it("プラスの残り時間は警告色にしない", () => {
    renderHeading({
      now: atJst("07:00"),
      group: morning([task({ id: 1, name: "朝食", estimateMinutes: 30 })]),
    });

    const remaining = within(headingOf("朝")).queryByText("+1:30");
    expect(remaining).not.toBeNull();
    expect(remaining?.classList.contains("text-danger")).toBe(false);
  });

  it("表示日が今日でなければ残り時間を出さない（現在時刻起点の値のため）", () => {
    renderHeading({
      isToday: false,
      now: atJst("07:00"),
      group: morning([task({ id: 1, name: "朝食", estimateMinutes: 30 })]),
    });

    expect(headingOf("朝").textContent).not.toContain("残り");
    // 時間合計は日付・時刻に依らず出す
    expect(headingOf("朝").textContent).toContain("合計");
  });

  it("現在時刻がセクション終了を過ぎた過去セクションでは残り時間を出さない", () => {
    renderHeading({
      now: atJst("10:00"),
      group: morning([task({ id: 1, name: "朝食", estimateMinutes: 30 })]),
    });

    expect(headingOf("朝").textContent).not.toContain("残り");
  });

  it("日界（F-116）を跨ぐ枠でも残り時間を論理日の区切りで測る", () => {
    renderHeading({
      // 日界 06:00・深夜 02:00 は前の論理日の続き。午後（13:00–翌06:00）はまだ終わっていない
      dayStartMinutes: 360,
      now: atJst("02:00", "2026-07-27"),
      group: afternoon([task({ id: 1, name: "夜更かし", estimateMinutes: 60 })]),
    });

    // 02:00 → 06:00 の240分から未完了見積もり60分を引いて +3:00
    // （日界を 0 と取り違えると枠の終わりが翌々日の 06:00 になり +27:00 になる）
    expect(within(headingOf("午後")).queryByText("+3:00")).not.toBeNull();
  });
});
