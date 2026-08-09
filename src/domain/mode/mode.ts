// モード集約（データモデル定義書 §3.2 / 画面定義書03 §3.2）
import { isPresetColor } from "../shared/color-presets";
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

export function validateModeInput(
  input: Readonly<{ name: string; color: string }>
): Result<{ name: string; color: string }, ModeError> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  if (!isPresetColor(input.color)) return err("invalid_color");
  return ok({ name: name.value, color: input.color });
}
