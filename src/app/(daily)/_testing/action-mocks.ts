// `vi.mock("../actions", ...)` のファクトリ。**アプリのモジュールを一切 import しない**
// （持ち込むのは `vi` だけ）——`vi.mock` はファイル先頭へホイストされるため、ファクトリから
// 掴む識別子が初期化前だと TDZ で落ちる。ここを独立させておけば各テストファイルは1行で敷ける:
//
//   vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());
//
// 偽物にしてよい理由と範囲は テスト戦略定義書 §2「偽物を置いてよい境界」。`"use server"` の先が
// pg.Pool と revalidatePath に届くため素の jsdom では描画すらできない。目的は「呼ばれたか」の
// 検証ではなく、成功・失敗のどちらを返すかを固定して楽観的更新（N-01）とロールバックの両分岐を
// 通すこと。返り値の契約は `setupBoard` の既定値と各テストの `vi.mocked(...)` が固定する
// （本物のシグネチャで型検査されるので、契約を外した偽物は build で落ちる）。
// 内側の協力者（domain・DailyList・useDailyShortcuts・Toast など）はすべて本物を使う
import { vi } from "vitest";

/** `../actions` の全 Server Action を素の `vi.fn()` に置き換えた形 */
export function actionMocks() {
  return {
    addTaskAction: vi.fn(),
    createRoutineFromTaskAction: vi.fn(),
    deleteTaskAction: vi.fn(),
    duplicateAndStartTaskAction: vi.fn(),
    duplicateTaskAction: vi.fn(),
    finishTaskAction: vi.fn(),
    moveTaskByStepAction: vi.fn(),
    postponeTaskAction: vi.fn(),
    renameTaskAction: vi.fn(),
    restoreCompletionAction: vi.fn(),
    restoreTaskAction: vi.fn(),
    setTaskHighlightAction: vi.fn(),
    setTaskModeAction: vi.fn(),
    setTaskProjectAction: vi.fn(),
    setTaskSectionAction: vi.fn(),
    startTaskAction: vi.fn(),
    suspendTaskAction: vi.fn(),
    undoCompleteAction: vi.fn(),
    undoStartAction: vi.fn(),
    updateTaskCommentAction: vi.fn(),
    updateTaskEstimateAction: vi.fn(),
    updateTaskPunchAction: vi.fn(),
  };
}
