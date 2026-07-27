import { describe, expect, it } from "vitest";
import { currentNotStartedId, currentTaskId, keepSelection, moveSelection } from "./selection";
import { task } from "./testing/task";

const startedAt = new Date("2026-07-26T08:00:00Z");
const endedAt = new Date("2026-07-26T08:30:00Z");

// 探索順を決めるのは**配列の並び**（＝表示順）で、セクション id の大小は挙動に影響しない。
// 以下の名前は fixture 上どこへ置くセクションかを示すだけ
/** 現在セクション。未分類は `sectionId: null`（`task` の既定） */
const CURRENT = 20;
/** 現在セクションより前（表示順で上）に置くセクション */
const EARLIER = 10;
/** 現在セクションより後ろ（表示順で下）に置くセクション */
const LATER = 30;

describe("currentTaskId（画面定義書01 §5: 現在地の規則）", () => {
  it("実行中タスクがあれば、現在セクションの未実行より優先してそれを指す（規則1）", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2, startedAt }),
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentTaskId(tasks, CURRENT)).toBe(2);
  });

  it("実行中がなければ未実行の探索（規則2〜4）へ落ちる", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2 }), // 未分類（リスト先頭）
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentTaskId(tasks, CURRENT)).toBe(3);
  });

  it("すべて完了なら現在地はない", () => {
    const tasks = [task({ id: 1, startedAt, endedAt })];
    expect(currentTaskId(tasks, CURRENT)).toBeNull();
  });

  it("タスクが0件なら現在地はない", () => {
    expect(currentTaskId([], CURRENT)).toBeNull();
  });
});

describe("currentNotStartedId（画面定義書01 §5 規則2〜4: 現在セクション → 未分類 → 表示順全体）", () => {
  it("未分類がリスト先頭にあっても、現在セクションの未実行を優先する（規則2 / FB-78）", () => {
    const tasks = [
      task({ id: 1 }), // 未分類（トリアージ前のインボックス。表示順では先頭）
      task({ id: 2, sectionId: EARLIER, startedAt, endedAt }),
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentNotStartedId(tasks, CURRENT)).toBe(3);
  });

  it("現在セクションより後ろのセクションに未実行があっても現在セクションを選ぶ（規則2）", () => {
    const tasks = [
      task({ id: 1, sectionId: EARLIER, startedAt, endedAt }),
      task({ id: 2, sectionId: CURRENT }),
      task({ id: 3, sectionId: LATER }),
    ];
    expect(currentNotStartedId(tasks, CURRENT)).toBe(2);
  });

  it("現在セクション内では表示順で最初の未実行を選ぶ（打刻済みは飛ばす）", () => {
    const tasks = [
      task({ id: 1, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 2, sectionId: CURRENT }),
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentNotStartedId(tasks, CURRENT)).toBe(2);
  });

  // 規則3 が規則4 のコードパスで満たされる理由は `currentNotStartedId` のコメント。
  // その前提（未分類が表示順の先頭）は domain/task/daily-list.test.ts が固定し、
  // 両者を合成した経路は daily-board.test.tsx が見る
  it("現在セクションに未実行がなければ未分類の未実行を選ぶ（規則3。未分類はリスト先頭）", () => {
    const tasks = [
      task({ id: 1 }), // 未分類
      task({ id: 2, sectionId: EARLIER }), // 現在セクションより前に残った未実行
      task({ id: 3, sectionId: CURRENT, startedAt, endedAt }),
    ];
    expect(currentNotStartedId(tasks, CURRENT)).toBe(1);
  });

  it("現在セクション・未分類のどちらにも未実行がなければ表示順で最初の未実行（規則4）", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }), // 未分類だが完了済み
      task({ id: 2, sectionId: EARLIER }), // 現在セクションより前に残った未実行
      task({ id: 3, sectionId: CURRENT, startedAt, endedAt }),
    ];
    expect(currentNotStartedId(tasks, CURRENT)).toBe(2);
  });

  it("規則4 は表示順で最初＝取りこぼした前のセクションへ戻る（後ろへは送らない）", () => {
    const tasks = [
      task({ id: 1, sectionId: EARLIER }), // やり残し
      task({ id: 2, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 3, sectionId: LATER }),
    ];
    expect(currentNotStartedId(tasks, CURRENT)).toBe(1);
  });

  it("現在セクションが定まらない（表示日が今日でない）なら規則2 を飛ばし表示順で最初の未実行", () => {
    const tasks = [
      task({ id: 1 }), // 未分類＝表示順で最初の未実行
      task({ id: 2, sectionId: CURRENT }),
    ];
    expect(currentNotStartedId(tasks, null)).toBe(1);
  });

  it("スナップショットに残る実行中タスク（終了打刻の対象）を飛ばす（F-211）", () => {
    // 実運用では daily-board が楽観的更新の適用前スナップショットを渡すため、いま終了打刻した
    // タスク（id=2）はまだ実行中として含まれる。currentTaskId（実行中を優先）と違い、実行中を
    // 無視して未実行を選ぶことを固定する（無視しないと終了したばかりの行を選び直してしまう）
    const tasks = [
      task({ id: 1, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 2, sectionId: CURRENT, startedAt }), // = いま終了打刻した対象
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentNotStartedId(tasks, CURRENT)).toBe(3);
  });

  it("送り先の未実行タスクがなければ null（呼び出し側は完了行に据え置く）", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2, sectionId: CURRENT, startedAt, endedAt }),
    ];
    expect(currentNotStartedId(tasks, CURRENT)).toBeNull();
  });

  it("タスクが0件なら null", () => {
    expect(currentNotStartedId([], CURRENT)).toBeNull();
  });
});

describe("moveSelection（画面定義書01 §6: J/K・↑↓ で選択移動）", () => {
  const tasks = [task({ id: 1 }), task({ id: 2 }), task({ id: 3 })];

  it("下へ1つ移動する", () => {
    expect(moveSelection(tasks, 1, 1)).toBe(2);
  });

  it("上へ1つ移動する", () => {
    expect(moveSelection(tasks, 3, -1)).toBe(2);
  });

  it("末尾で下へ移動しても止まる", () => {
    expect(moveSelection(tasks, 3, 1)).toBe(3);
  });

  it("先頭で上へ移動しても止まる", () => {
    expect(moveSelection(tasks, 1, -1)).toBe(1);
  });

  it("未選択から下へ移動すると先頭を選ぶ", () => {
    expect(moveSelection(tasks, null, 1)).toBe(1);
  });

  it("未選択から上へ移動すると末尾を選ぶ", () => {
    expect(moveSelection(tasks, null, -1)).toBe(3);
  });

  it("タスクが0件なら選択なし", () => {
    expect(moveSelection([], 1, 1)).toBeNull();
  });

  it("選択IDが一覧に存在しない場合は先頭へフォールバックする", () => {
    expect(moveSelection(tasks, 999, 1)).toBe(1);
  });
});

describe("keepSelection（削除・日付移動の後も選択を保つ）", () => {
  it("選択中のタスクが残っていればそのまま", () => {
    const tasks = [task({ id: 1 }), task({ id: 2 })];
    expect(keepSelection(tasks, 2, CURRENT)).toBe(2);
  });

  it("選択中のタスクが消えたら現在地へ戻す", () => {
    const tasks = [task({ id: 1, startedAt }), task({ id: 3 })];
    expect(keepSelection(tasks, 99, CURRENT)).toBe(1);
  });

  it("未選択なら現在地を選ぶ（未分類より現在セクションの未実行が先）", () => {
    const tasks = [task({ id: 1 }), task({ id: 2, sectionId: CURRENT })];
    expect(keepSelection(tasks, null, CURRENT)).toBe(2);
  });
});
