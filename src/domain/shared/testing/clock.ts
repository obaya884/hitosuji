// テストで打刻時刻の Date を組み立てる道具（T-43）。
// アプリは時刻の解釈・導出・表示のすべてを `APP_TIME_ZONE`（Asia/Tokyo）固定で扱うので（T-47）、
// テストデータも JST の壁時計1本で組めばよく、実行環境の TZ に依らない。
import type { LogicalDate } from "../logical-date";

/**
 * ユニット・コンポーネント段のフィクスチャ共通の基準日（**日曜**）。
 * 曜日そのものに依拠するテスト（週次ルーチン・週送りなど）だけが自前の日付を持つ。
 *
 * 統合テスト（`*.int.test.ts`）と日付計算そのものを見るテスト（`logical-date` /
 * `month-grid` / `format` / 日付ナビ）は**自前の日付のまま**で、ここには寄せていない
 */
export const TEST_DATE: LogicalDate = "2026-07-26";

/**
 * `TEST_DATE` の翌暦日。日界（F-116）が 00:00 以外だと論理日は暦日をまたぐので、
 * 「またいだ側」を指す期待値がこれになる（打刻修正 F-203 / 画面定義書01 §3.3）
 */
export const NEXT_TEST_DATE: LogicalDate = "2026-07-27";

/**
 * `HH:MM` を **JST の壁時計**として Date にする。
 * 打刻の表示（`formatClock`）・入力の解釈（`punch-edit`）・導出（`projection`）は
 * いずれも `APP_TIME_ZONE = Asia/Tokyo` 基準なので、時刻を伴うテストデータはすべてこれで組む
 */
export function atJst(clock: string, date: LogicalDate = TEST_DATE): Date {
  return new Date(`${date}T${clock}:00+09:00`);
}
