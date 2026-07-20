// モード集約（データモデル定義書 §3.2 / 画面定義書03 §3.2）
import { validateName, type NameError } from "../shared/master-name";
import { err, ok, type Result } from "../shared/result";

export type ModeId = number;

export type Mode = Readonly<{
  id: ModeId;
  name: string;
  color: string;
  isArchived: boolean;
}>;

export type ModeError = NameError | "invalid_color";

/** プリセット13色（画面定義書03 §3.2: 12色＋グレー。自由入力は設けない。N-05） */
export const MODE_COLORS = [
  "#ef4444", // 赤
  "#f97316", // オレンジ
  "#f59e0b", // 琥珀
  "#eab308", // 黄
  "#84cc16", // ライム
  "#22c55e", // 緑
  "#14b8a6", // ティール
  "#06b6d4", // シアン
  "#3b82f6", // 青
  "#6366f1", // インディゴ
  "#a855f7", // 紫
  "#ec4899", // ピンク
  "#9ca3af", // グレー（初期データ「休憩」で使う）
] as const;

export function isPresetColor(color: string): boolean {
  return (MODE_COLORS as readonly string[]).includes(color);
}

/** プリセット色の日本語名（画面定義書03 §3.2: バーの横に色名を併記する） */
export const MODE_COLOR_NAMES: Readonly<Record<string, string>> = {
  "#ef4444": "赤",
  "#f97316": "オレンジ",
  "#f59e0b": "琥珀",
  "#eab308": "黄",
  "#84cc16": "ライム",
  "#22c55e": "緑",
  "#14b8a6": "ティール",
  "#06b6d4": "シアン",
  "#3b82f6": "青",
  "#6366f1": "インディゴ",
  "#a855f7": "紫",
  "#ec4899": "ピンク",
  "#9ca3af": "グレー",
};

/** 色名を返す。未知の色（プリセット外）でも落ちず、hex 値をそのまま返す */
export function modeColorName(color: string): string {
  return MODE_COLOR_NAMES[color] ?? color;
}

export function validateModeInput(
  input: Readonly<{ name: string; color: string }>
): Result<{ name: string; color: string }, ModeError> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  if (!isPresetColor(input.color)) return err("invalid_color");
  return ok({ name: name.value, color: input.color });
}
