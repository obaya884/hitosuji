// マスタ共通の名前バリデーション（画面定義書03 §3: 名前はテキスト必須）
import { err, ok, type Result } from "./result";

export type NameError = "name_required" | "name_too_long";

const MAX_NAME_LENGTH = 50;

export function validateName(raw: string): Result<string, NameError> {
  const name = raw.trim();
  if (name === "") return err("name_required");
  if (name.length > MAX_NAME_LENGTH) return err("name_too_long");
  return ok(name);
}
