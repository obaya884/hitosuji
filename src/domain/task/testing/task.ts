// テスト用の Task 組み立て（T-43）。domain・usecases・presentation の全段から使う——
// domain は最下層なので、どの層から参照しても依存方向に反しない。
//
// **既定値は中立**（未設定・未打刻・素の並び）で固定する。テストが依拠する値は
// `task({ id: 1, estimateMinutes: 30 })` のように**呼び出し側へ書く**こと。既定を
// 「それらしい値」にすると、本文のどこにも現れない値にテストが寄りかかり読めなくなる。
import { TEST_DATE } from "../../shared/testing/clock";
import type { Task } from "../task";

export function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: TEST_DATE,
    name: `T${over.id}`,
    estimateMinutes: 0, // 0 = 未設定
    sectionId: null,
    modeId: null,
    projectId: null,
    bundleId: null,
    sortOrder: over.id * 1000, // 間隔採番（データモデル定義書 §3.5）。id 順＝表示順になる
    startedAt: null,
    endedAt: null,
    comment: null,
    highlighted: false,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}
