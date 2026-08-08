// マスタ共通の名前バリデーション（画面定義書03 §4「名前の入力」）
import { err, ok, type Result } from "./result";

export type NameError = "name_required";

/**
 * 空・空白のみは確定不可。**文字数の上限は設けない**（画面定義書03 §4「名前の入力」）。
 * `domain/task/edit.ts` の `validateTaskName` と実装は同じになったが**畳まない**——
 * エラー型（`NameError` / `TaskEditError`）が別で、文言も画面ごとの裁量に置いているため
 * （`app/_lib/error-messages.ts` が同じ理由で2辞書を畳んでいないのと揃える）
 */
export function validateName(raw: string): Result<string, NameError> {
  const name = raw.trim();
  return name === "" ? err("name_required") : ok(name);
}
