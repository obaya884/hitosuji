// ドメインのエラーコードを画面表示用の日本語メッセージへ変換する（表示都合なので presentation に置く）
import type { ModeError } from "@/domain/mode/mode";
import type { ProjectError } from "@/domain/project/project";
import type { SectionError } from "@/domain/section/section";
import type { MasterDeletionError } from "@/domain/shared/master-deletion";
import type { ActionResult } from "@/app/_lib/action-result";

// 共通結果型を再エクスポート（masters の消費側は従来どおり ActionResult を import できる。T-08）
export type { ActionResult };

export type MasterError = SectionError | ModeError | ProjectError | MasterDeletionError;

const MESSAGES: Record<MasterError, string> = {
  name_required: "名前を入力してください",
  name_too_long: "名前は50文字以内で入力してください",
  invalid_start_time: "開始時刻を HH:MM 形式で入力してください",
  duplicate_start_time: "同じ開始時刻の有効なセクションがあります",
  last_active_section: "有効なセクションは最低1件必要です",
  invalid_color: "色はプリセットから選択してください",
  not_found: "対象が見つかりません（画面を再読み込みしてください）",
  not_archived: "削除できるのはアーカイブ済みのものだけです",
  // 参照元はマスタごとに違う（画面定義書03 §4.1）ので、種類を挙げずに言い切る
  has_references: "参照しているデータがあるため削除できません",
};

export function failure(error: MasterError): ActionResult {
  return { ok: false, message: MESSAGES[error] };
}
