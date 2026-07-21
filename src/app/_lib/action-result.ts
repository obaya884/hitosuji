// Server Action の共通結果型（全画面共有）。成功か、失敗（表示用メッセージ付き）かを表す。
// 各画面の結果型（DailyActionResult / RoutineActionResult / masters の ActionResult）はこれを別名で再エクスポートする（T-08）
export type ActionResult = Readonly<{ ok: true } | { ok: false; message: string }>;
