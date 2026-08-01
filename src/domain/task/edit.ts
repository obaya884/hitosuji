// タスクのインライン編集の検証（画面定義書01 §3.3 / §8）
import { err, ok, type Result } from "../shared/result";

export type TaskEditError = "name_required" | "invalid_estimate";

/** タスク名は空にできない（§8: 空・空白のみは確定不可） */
export function validateTaskName(raw: string): Result<string, TaskEditError> {
  const name = raw.trim();
  return name === "" ? err("name_required") : ok(name);
}

/**
 * 見積もりは分の整数で入力する（§3.3）。非数値・負値は確定不可（§8）。
 * 0 は「未設定」として許容し、`--:--` 表示・終了予定計算の対象外になる
 */
export function validateEstimateMinutes(raw: string): Result<number, TaskEditError> {
  const trimmed = raw.trim();
  if (trimmed === "") return ok(0); // 空入力は未設定へ戻す
  if (!/^\d+$/.test(trimmed)) return err("invalid_estimate");

  const minutes = Number(trimmed);
  if (!Number.isSafeInteger(minutes)) return err("invalid_estimate");
  return ok(minutes);
}

/**
 * コメントの正規化（F-206 / 画面定義書01 O-16 / データモデル定義書 §3.5）。
 * **長さの制限は設けず、途中の改行もそのまま残す**。前後の空白だけ落とし、
 * 空・空白のみは未設定（null）として扱う——確定で消せる操作なので失敗しない
 */
export function normalizeComment(raw: string): string | null {
  const comment = raw.trim();
  return comment === "" ? null : comment;
}
