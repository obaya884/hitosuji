// テストで打刻時刻の Date を組み立てる道具（T-43）。
// **JST 固定とローカル壁時計は別の契約**なので名前で呼び分ける——アプリの表示側
// （`format.ts`）は Asia/Tokyo 固定、入力の解釈側（`applyClockTime`）は実行環境の
// ローカル時刻という非対称が現にあるため（根の非対称は T-47）。一方に寄せて組むと
// JST の手元では通り **UTC で走る CI だけが落ちる**。
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
 * `HH:MM` を **JST の壁時計**として Date にする。
 * 打刻の表示（`formatClock`）は `APP_TIME_ZONE = Asia/Tokyo` 固定で整形するので、
 * **画面に出る時刻を期待するテスト**はこちらでデータを組む
 */
export function atJst(clock: string, date: LogicalDate = TEST_DATE): Date {
  return new Date(`${date}T${clock}:00+09:00`);
}

/**
 * `HH:MM` を **実行環境のローカル壁時計**として Date にする。
 * 打刻の修正（`applyClockTime`）は `Date#setHours` でローカル解釈するので、
 * **入力の解釈を見るテスト**はこちらで組む
 */
export function atLocal(clock: string, date: LogicalDate = TEST_DATE): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = clock.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}
