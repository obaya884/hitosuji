// 参照先 URL の検証（F-125 / データモデル定義書 §3.5）。タスク（画面定義書01 O-18）と
// ルーチン（画面定義書02 §4）が同じ規則で通る唯一の入口
import { err, ok, type Result } from "./result";

export type UrlError = "invalid_url";

/**
 * 受け付けるのは `http://` / `https://` で始まる1件だけ（許可リスト方式。`javascript:` 等を弾く）。
 * 前後の空白を落とし、空・空白のみは未設定（null）として扱う——消す操作なので失敗しない。
 * 長さの制限は設けない（コメントと同じ扱い）
 */
export function validateUrl(raw: string): Result<string | null, UrlError> {
  const url = raw.trim();
  if (url === "") return ok(null);
  // 見るのはスキームだけ（ホストの有無・構文の妥当性は見ない）。自分で打つ値なので、
  // 開けない URL を弾く価値より許可リストの単純さを取る（`https://` だけでも通り、開いても空のタブになるだけ）
  return /^https?:\/\//i.test(url) ? ok(url) : err("invalid_url");
}
