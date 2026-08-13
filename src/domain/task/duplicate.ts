// 複製（F-111 / 画面定義書01 O-11）
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
import type { Task } from "./task";

/**
 * 複製で引き継ぐ内容。routine_id・split_parent_id・コメント・highlighted・**bundle_id は引き継がない**（F-111）。
 * bundle_id を持たないのは意図的（データモデル定義書 §4.8）:
 * routine_id・コメント・highlighted を引き継がない扱いと揃えたもので、あわせて複製するたびに
 * 未完了メンバーが増えてバンドルが進行中のままになり割り込み警告が鳴り続ける事故も防ぐ。
 * **列が増えるたびにここへ足す前に §4.8 の表を確認する**（足さないことが仕様）
 */
export type DuplicateDraft = Readonly<{
  name: string;
  estimateMinutes: number; // 満額を引き継ぐ
  modeId: ModeId | null;
  projectId: ProjectId | null;
}>;

export function duplicateDraft(original: Task): DuplicateDraft {
  return {
    name: original.name,
    estimateMinutes: original.estimateMinutes,
    modeId: original.modeId,
    projectId: original.projectId,
  };
}
