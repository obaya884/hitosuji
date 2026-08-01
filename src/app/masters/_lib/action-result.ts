// マスタ管理の Server Action が失敗を返すときの入口。文言そのものは全画面分を集めた
// `_lib/error-messages.ts` が持つ（辞書の置き場はアーキテクチャ定義書 §2 の例外条項。T-78）
import type { ActionResult } from "@/app/_lib/action-result";
import { MASTER_MESSAGES, type MasterError } from "@/app/_lib/error-messages";

// 共通結果型を再エクスポート（masters の消費側は従来どおり ActionResult を import できる。T-08）
export type { ActionResult };

export function failure(error: MasterError): ActionResult {
  return { ok: false, message: MASTER_MESSAGES[error] };
}
