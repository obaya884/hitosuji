// ドメインのエラーコードを画面表示用の日本語メッセージへ変換する（表示都合なので presentation に置く）
import type { ModeError } from "@/domain/mode/mode";
import type { ProjectError } from "@/domain/project/project";
import type { SectionError } from "@/domain/section/section";

export type MasterError = SectionError | ModeError | ProjectError;

const MESSAGES: Record<MasterError, string> = {
  name_required: "名前を入力してください",
  name_too_long: "名前は50文字以内で入力してください",
  invalid_start_time: "開始時刻を HH:MM 形式で入力してください",
  duplicate_start_time: "同じ開始時刻の有効なセクションがあります",
  last_active_section: "有効なセクションは最低1件必要です",
  invalid_color: "色はプリセットから選択してください",
};

export type ActionResult = Readonly<{ ok: true } | { ok: false; message: string }>;

export function failure(error: MasterError): ActionResult {
  return { ok: false, message: MESSAGES[error] };
}
