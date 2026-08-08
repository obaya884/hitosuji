import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Section } from "@/domain/section/section";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { faintTextOf } from "@/app/_testing/dom";
import { morning, sectionGroup, unclassifiedGroup } from "../_testing/factories";
import { headingOf } from "../_testing/table-helpers";
import { GroupHeading, type GroupHeadingProps } from "./group-heading";

/**
 * props は `GroupHeadingProps` から派生させる（同じ形を手で写さない）。**`group` だけ必須**——
 * どのテストも自分が描くグループに依拠するので既定値を持たせない（テスト戦略定義書 §4）
 */
type Overrides = Partial<Omit<GroupHeadingProps, "group">> & Pick<GroupHeadingProps, "group">;

function renderHeading(overrides: Overrides) {
  return render(
    <table>
      <tbody>
        <GroupHeading
          group={overrides.group}
          // 残り時間の値と表示条件はリスト側が決めて配る（見出しは `now` も表示日も持たない）。
          // 既定は中立の「出さない」とし、依拠するテストが値を明示する（§3.2 / F-110）
          remainingMinutes={overrides.remainingMinutes ?? null}
          currentSectionId={overrides.currentSectionId ?? null}
        />
      </tbody>
    </table>
  );
}

// 現在セクションの強調（F-121）は `currentSectionId` の導出とセットで意味を持つため、
// 「現在時刻がどのセクションか」まで通す形で daily-board.display.test.tsx が見る（導出は board の仕事）
describe("GroupHeading（画面定義書01 §3.2: セクション見出し行）", () => {
  it("セクション名と時間帯を出す", () => {
    renderHeading({ group: morning([task({ id: 1, name: "朝食" })]) });

    expect(within(headingOf("朝")).queryByText("06:00–09:00")).not.toBeNull();
  });

  // 未分類に残り時間が来ないこと自体はリスト側の責務（見出しは判定を持たない）なので
  // daily-list.test.tsx が見る。ここでは時間帯を出さないことだけを確かめる
  it("未分類グループは名前だけで、時間帯を出さない（枠を持たない）", () => {
    renderHeading({ group: unclassifiedGroup([task({ id: 1, name: "買い出しメモ" })]) });

    expect(headingOf("未分類").textContent).not.toContain("–");
  });

  // アーカイブ済みセクションは `sectionRanges` が落として枠を導けないので、
  // `morning` 系ではなく `sectionGroup` へ直に組んで渡す（T-110）
  it("アーカイブ済みセクションのグループは名前と開始時刻を出し、枠に依る表示だけを落とす", () => {
    const archived: Section = { id: 900, name: "旧セクション", startTime: "22:00", isArchived: true };

    renderHeading({
      group: sectionGroup(archived, null, [task({ id: 1, name: "夜の片付け", estimateMinutes: 20 })]),
    });

    const heading = headingOf("旧セクション");
    expect(within(heading).queryByText("22:00")).not.toBeNull();
    // 枠から導く2つ（時間帯の終了時刻 `–HH:MM` と時間合計の分母 `/H:MM`）だけが出ない。
    // 合計は分子まで含めて全文で見る——分母と一緒に分子も落とす書き換えを通さないため
    expect(heading.textContent).not.toContain("–");
    expect(within(heading).getByText(/^合計/).textContent).toBe("合計 0:20");
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

  // 見出しはメタ段だが、記号はその中でさらに薄くする（00_共通 §2.4）
  it("時間合計が0のときは薄色の `--:--`。確定している分母はメタ段のまま（00_共通 §2.4）", () => {
    renderHeading({ group: morning([task({ id: 1, name: "朝食", estimateMinutes: 0 })]) });

    const heading = headingOf("朝");
    expect(within(heading).getByText(/^合計/).textContent).toBe("合計 --:--/3:00");
    expect(faintTextOf(heading)).toBe("--:--");
    // 分母は確定値なので薄くしない。`faintTextOf` は最初の薄色要素を返すため、
    // 見出し全体で見るだけでは分母が薄くなっても記号側が先に当たって通ってしまう
    expect(faintTextOf(within(heading).getByText("/3:00"))).toBeUndefined();
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

  it("進捗の件数はメタ段で出す（00_共通 §1.1。見出しの数値はサマリより1段引く）", () => {
    renderHeading({
      group: morning([task({ id: 1, name: "朝食", startedAt: atJst("06:30"), endedAt: atJst("06:48") })]),
    });

    const progress = within(headingOf("朝")).getByText("1/1");
    expect(progress.classList.contains("text-xs")).toBe(true);
  });

  it("0件のグループは見出しだけを置き、進捗・時間合計・残り時間を出さない（FB-25/FB-26）", () => {
    // 空のセクションにも `sectionSlacks` は枠いっぱいの余裕を返すので、0件のガードが
    // 効いていることを見るには値を渡したうえで「出ない」を確かめる必要がある
    renderHeading({ remainingMinutes: 180, group: morning([]) });

    expect(within(headingOf("朝")).queryByText("06:00–09:00")).not.toBeNull();
    expect(headingOf("朝").textContent).not.toContain("合計");
    expect(headingOf("朝").textContent).not.toContain("0/0");
    expect(headingOf("朝").textContent).not.toContain("残り");
  });

  // 値そのもの（max・独立・日界）は projection.test.ts、配り分けと表示条件は daily-list.test.tsx が
  // 見る（§3.2 / F-110）。ここで見るのは受け取った値の描き方だけで、タスクの見積もりは結果に関与しない
  it("プラスの残り時間は符号付きで出し、警告色にしない（F-110）", () => {
    renderHeading({ remainingMinutes: 90, group: morning([task({ id: 1, name: "朝食" })]) });

    expect(headingOf("朝").textContent).toContain("残り");
    const remaining = within(headingOf("朝")).queryByText("+1:30");
    expect(remaining).not.toBeNull();
    expect(remaining?.classList.contains("text-danger")).toBe(false);
  });

  it("残り時間のマイナスは警告色で示す（FB-31/FB-32: 溢れが読めるように）", () => {
    renderHeading({ remainingMinutes: -60, group: morning([task({ id: 1, name: "朝食" })]) });

    const remaining = within(headingOf("朝")).queryByText("-1:00");
    expect(remaining).not.toBeNull();
    expect(remaining?.classList.contains("text-danger")).toBe(true);
  });

  // 符号は差の向きを示す記号なので、離れていない行には付けない（§3.2。04 §3.3 の差異と同じ規則）
  it("ちょうど枠に収まる（残り0分）は符号なしで、警告色にもしない", () => {
    renderHeading({ remainingMinutes: 0, group: morning([task({ id: 1, name: "朝食" })]) });

    const remaining = within(headingOf("朝")).queryByText("0:00");
    expect(remaining).not.toBeNull();
    expect(remaining?.classList.contains("text-danger")).toBe(false);
  });

  it("残り時間が渡されなければ出さない（時間合計は日付・時刻に依らず出す）", () => {
    renderHeading({ remainingMinutes: null, group: morning([task({ id: 1, name: "朝食" })]) });

    expect(headingOf("朝").textContent).not.toContain("残り");
    expect(headingOf("朝").textContent).toContain("合計");
  });
});
