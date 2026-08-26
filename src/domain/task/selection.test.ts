import { describe, expect, it } from "vitest";
import {
  currentNotStartedId,
  currentTaskId,
  keepSelection,
  moveSelection,
  selectionAfterRemoval,
} from "./selection";
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
/** さらに後ろ。規則3 が「後ろのうち表示順で最初」を選ぶことを見るために要る */
const LAST = 40;
/** 表示順のセクション（未分類 null を先頭にした回転順。§3.2） */
const SECTION_ORDER = [null, EARLIER, CURRENT, LATER, LAST];

describe("currentTaskId（画面定義書01 §5: 現在地の規則）", () => {
  it("実行中タスクがあれば、現在セクションの未実行より優先してそれを指す（規則1）", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2, startedAt }),
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentTaskId(tasks, CURRENT, SECTION_ORDER)).toBe(2);
  });

  it("実行中がなければ未実行の探索（規則2〜5）へ落ちる", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2 }), // 未分類（リスト先頭）
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentTaskId(tasks, CURRENT, SECTION_ORDER)).toBe(3);
  });

  it("すべて完了なら現在地はない", () => {
    const tasks = [task({ id: 1, startedAt, endedAt })];
    expect(currentTaskId(tasks, CURRENT, SECTION_ORDER)).toBeNull();
  });

  it("タスクが0件なら現在地はない", () => {
    expect(currentTaskId([], CURRENT, SECTION_ORDER)).toBeNull();
  });
});

describe("currentNotStartedId（画面定義書01 §5 規則2〜5: 現在セクション → 後ろのセクション → 未分類 → 表示順全体）", () => {
  it("未分類がリスト先頭にあっても、現在セクションの未実行を優先する（規則2 / FB-78）", () => {
    const tasks = [
      task({ id: 1 }), // 未分類（トリアージ前のインボックス。表示順では先頭）
      task({ id: 2, sectionId: EARLIER, startedAt, endedAt }),
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(3);
  });

  it("前のセクションのやり残しより現在セクションを優先する（後ろのセクションも見ない。規則2）", () => {
    const tasks = [
      task({ id: 1, sectionId: EARLIER }), // やり残し（表示順では現在セクションより上）
      task({ id: 2, sectionId: CURRENT }),
      task({ id: 3, sectionId: LATER }),
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(2);
  });

  it("現在セクション内では表示順で最初の未実行を選ぶ（打刻済みは飛ばす）", () => {
    const tasks = [
      task({ id: 1, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 2, sectionId: CURRENT }),
      task({ id: 3, sectionId: CURRENT }),
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(2);
  });

  it("現在セクションを打ち終えたら、未分類ではなく後ろのセクションへ進む（規則3 / FB-109）", () => {
    const tasks = [
      task({ id: 1 }), // 未分類（表示順では先頭にあるが、後ろのセクションに譲る）
      task({ id: 2, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 3, sectionId: LATER }),
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(3);
  });

  // 未分類を置くのは**規則3 を消したときに落ちる**ようにするため——置かないと規則5 の
  // フォールバック（表示順で最初の未実行）が同じ答えを返し、テストが何も守らなくなる
  it("後ろのセクションが複数あれば表示順で最初のものを選ぶ（規則3）", () => {
    const tasks = [
      task({ id: 1 }), // 未分類
      task({ id: 2, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 3, sectionId: LATER }),
      task({ id: 4, sectionId: LAST }), // さらに後ろ。ここまで飛ばさない
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(3);
  });

  it("直後の後ろを打ち終えていれば、さらに後ろのセクションまで進む（規則3）", () => {
    const tasks = [
      task({ id: 1 }), // 未分類
      task({ id: 2, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 3, sectionId: LATER, startedAt, endedAt }),
      task({ id: 4, sectionId: LAST }),
    ];
    // 「後ろ」は直後の1セクションではなく、現在セクションより後ろの全部
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(4);
  });

  it("前のセクションのやり残しより後ろのセクションを優先する（規則3）", () => {
    const tasks = [
      task({ id: 1, sectionId: EARLIER }), // やり残し
      task({ id: 2, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 3, sectionId: LATER }),
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(3);
  });

  // 呼び出し側では起きない不整合入力（有効セクションは必ず表示される §3.2）への防御。
  // **先頭の未実行も表示順に無いセクションへ置く**——未分類に置くと、防御を外しても
  // 「表示順の先頭」として同じ答えが返り、テストが何も守らなくなる
  it("現在セクションが表示順に居なければ規則3 を飛ばす（「後ろ」を定義できない）", () => {
    const tasks = [
      task({ id: 1, sectionId: EARLIER }),
      task({ id: 2, sectionId: LATER }),
    ];
    expect(currentNotStartedId(tasks, CURRENT, [null, LATER])).toBe(1);
  });

  // 規則4 が規則5 のコードパスで満たされる理由は `currentNotStartedId` のコメント。
  // その前提（未分類が表示順の先頭）は domain/task/daily-list.test.ts が固定し、
  // 両者を合成した経路は daily-board.shortcuts.test.tsx が見る
  it("現在セクションにも後ろにも未実行がなければ未分類の未実行を選ぶ（規則4。未分類はリスト先頭）", () => {
    const tasks = [
      task({ id: 1 }), // 未分類
      task({ id: 2, sectionId: EARLIER }), // 現在セクションより前に残った未実行
      task({ id: 3, sectionId: CURRENT, startedAt, endedAt }),
      task({ id: 4, sectionId: LATER, startedAt, endedAt }), // 後ろも打ち終えている
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(1);
  });

  it("現在セクションが表示順の末尾なら後ろは無い（規則3 は空振り。日界をまたぐ最後の枠）", () => {
    const tasks = [
      task({ id: 1 }), // 未分類
      task({ id: 2, sectionId: LAST, startedAt, endedAt }),
    ];
    expect(currentNotStartedId(tasks, LAST, SECTION_ORDER)).toBe(1);
  });

  it("現在セクション・後ろ・未分類のどこにも未実行がなければ表示順で最初の未実行＝前のやり残し（規則5）", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }), // 未分類だが完了済み
      task({ id: 2, sectionId: EARLIER }), // 現在セクションより前に残った未実行
      task({ id: 3, sectionId: CURRENT, startedAt, endedAt }),
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(2);
  });

  it("現在セクションが定まらない（表示日が今日でない）なら規則2・3 を飛ばし表示順で最初の未実行", () => {
    const tasks = [
      task({ id: 1 }), // 未分類＝表示順で最初の未実行
      task({ id: 2, sectionId: CURRENT }),
      task({ id: 3, sectionId: LATER }),
    ];
    expect(currentNotStartedId(tasks, null, SECTION_ORDER)).toBe(1);
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
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBe(3);
  });

  it("送り先の未実行タスクがなければ null（呼び出し側は完了行に据え置く）", () => {
    const tasks = [
      task({ id: 1, startedAt, endedAt }),
      task({ id: 2, sectionId: CURRENT, startedAt, endedAt }),
    ];
    expect(currentNotStartedId(tasks, CURRENT, SECTION_ORDER)).toBeNull();
  });

  it("タスクが0件なら null", () => {
    expect(currentNotStartedId([], CURRENT, SECTION_ORDER)).toBeNull();
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

describe("selectionAfterRemoval（画面定義書01 §5: 選択行が消えたときの送り先）", () => {
  it("消えた行の直後を選ぶ", () => {
    const tasks = [task({ id: 1 }), task({ id: 2 }), task({ id: 3 })];
    expect(selectionAfterRemoval(tasks, 2)).toBe(3);
  });

  // 3件で見るのは、2件だと「直前」と「先頭」が同じ値になり先頭フォールバックの変異を殺せないため
  it("末尾が消えたときは直前を選ぶ（先頭には戻さない）", () => {
    const tasks = [task({ id: 1 }), task({ id: 2 }), task({ id: 3 })];
    expect(selectionAfterRemoval(tasks, 3)).toBe(2);
  });

  it("直後が完了でも状態を問わずそれを選ぶ", () => {
    const tasks = [task({ id: 1 }), task({ id: 2, startedAt, endedAt }), task({ id: 3 })];
    expect(selectionAfterRemoval(tasks, 1)).toBe(2);
  });

  it("直後が実行中でも状態を問わずそれを選ぶ", () => {
    const tasks = [task({ id: 1 }), task({ id: 2, startedAt }), task({ id: 3 })];
    expect(selectionAfterRemoval(tasks, 1)).toBe(2);
  });

  it("直後がセクションをまたいでいてもそのまま選ぶ（送り先は表示順だけで決まる）", () => {
    const tasks = [task({ id: 1, sectionId: CURRENT }), task({ id: 2, sectionId: LATER })];
    expect(selectionAfterRemoval(tasks, 1)).toBe(2);
  });

  it("1件しかなければ選択はなくなる", () => {
    expect(selectionAfterRemoval([task({ id: 1 })], 1)).toBeNull();
  });

  it("消えた行が一覧に無ければ送り先もない", () => {
    expect(selectionAfterRemoval([task({ id: 1 }), task({ id: 2 })], 99)).toBeNull();
  });
});

describe("keepSelection（削除・日付移動の後も選択を保つ）", () => {
  it("選択中のタスクが残っていればそのまま", () => {
    const tasks = [task({ id: 1 }), task({ id: 2 })];
    expect(keepSelection(tasks, 2, CURRENT, SECTION_ORDER)).toBe(2);
  });

  it("選択中のタスクが消えたら現在地へ戻す", () => {
    const tasks = [task({ id: 1, startedAt }), task({ id: 3 })];
    expect(keepSelection(tasks, 99, CURRENT, SECTION_ORDER)).toBe(1);
  });

  it("未選択なら現在地を選ぶ（未分類より現在セクションの未実行が先）", () => {
    const tasks = [task({ id: 1 }), task({ id: 2, sectionId: CURRENT })];
    expect(keepSelection(tasks, null, CURRENT, SECTION_ORDER)).toBe(2);
  });
});
