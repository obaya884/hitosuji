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

/**
 * プリセット13色（画面定義書03 §3.2 の表と1:1。12色＋グレー。自由入力は設けない。N-05）。
 * 色値と色名は必ずここで対にする（別々のリストに分けると片方だけ増えて色名が静かに落ちる）
 */
export const MODE_COLOR_PRESETS = [
  { value: "#ef4444", name: "赤" },
  { value: "#f97316", name: "オレンジ" },
  { value: "#f59e0b", name: "琥珀" },
  { value: "#eab308", name: "黄" },
  { value: "#84cc16", name: "ライム" },
  { value: "#22c55e", name: "緑" },
  { value: "#14b8a6", name: "ティール" },
  { value: "#06b6d4", name: "シアン" },
  { value: "#3b82f6", name: "青" },
  { value: "#6366f1", name: "インディゴ" },
  { value: "#a855f7", name: "紫" },
  { value: "#ec4899", name: "ピンク" },
  { value: "#9ca3af", name: "グレー" },
] as const;

type ModeColorName = (typeof MODE_COLOR_PRESETS)[number]["name"];

/** プリセットの色値だけを並べたもの（並びは画面定義書03 §3.2 の表と同じ） */
export const MODE_COLORS: readonly string[] = MODE_COLOR_PRESETS.map((p) => p.value);

/**
 * 色名から色値を引く（初期データは色を名前で指定する。データモデル定義書 §5）。
 * 逆向きの `modeColorName` が関数なのに対しこちらを Record にしているのは、
 * 呼び手が定数（`MODE_COLOR_BY_NAME["青"]`）で引くため色名の打ち間違いを型で弾きたいから
 */
export const MODE_COLOR_BY_NAME = Object.fromEntries(
  MODE_COLOR_PRESETS.map((p) => [p.name, p.value] as const)
) as Readonly<Record<ModeColorName, string>>;

export function isPresetColor(color: string): boolean {
  return MODE_COLORS.includes(color);
}

/** 色名を返す。未知の色（プリセット外）でも落ちず、hex 値をそのまま返す */
export function modeColorName(color: string): string {
  return MODE_COLOR_PRESETS.find((p) => p.value === color)?.name ?? color;
}

export function validateModeInput(
  input: Readonly<{ name: string; color: string }>
): Result<{ name: string; color: string }, ModeError> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  if (!isPresetColor(input.color)) return err("invalid_color");
  return ok({ name: name.value, color: input.color });
}
