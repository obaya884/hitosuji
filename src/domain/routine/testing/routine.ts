// テスト用の Routine 組み立て（T-43）。domain・usecases・presentation の全段から使う。
// 既定は中立に固定し、テストが依拠する値は呼び出し側へ書く（テスト戦略定義書 §4）。
//
// ただし Routine は `task()` と違い**中立値が存在しない項目を持つ**——繰り返し種別と
// 開始想定時刻は NOT NULL（データモデル定義書 §3.4）で「未設定」を表せない。ここは
// 最も単純な値（毎日・06:30）を置くので、**そこに依拠するテストは値を明示すること**
// （例: 展開先セクションを見るテストは `scheduledStartTime` を必ず書く）。
import type { Routine } from "../routine";

export function routine(over: Partial<Routine> & { id: number }): Routine {
  return {
    name: `R${over.id}`,
    estimateMinutes: 0, // 0 = 未設定
    scheduledStartTime: "06:30", // 中立値なし（上記）
    modeId: null,
    projectId: null,
    bundleId: null,
    recurrenceType: "daily", // 中立値なし（上記）
    weekdays: null,
    weekInterval: null,
    monthDay: null,
    intervalDays: null,
    startDate: "2026-01-01", // 十分に過去（開始日の判定を見るテストだけが上書きする）
    endDate: null,
    isActive: true,
    ...over,
  };
}
