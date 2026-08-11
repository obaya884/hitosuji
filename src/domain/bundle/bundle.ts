// バンドル集約（データモデル定義書 §3.7 / 画面定義書05）
import { isPresetColor } from "../shared/color-presets";
import { validateName, type NameError } from "../shared/master-name";
import { err, ok, type Result } from "../shared/result";

export type BundleId = number;

export type Bundle = Readonly<{
  id: BundleId;
  name: string;
  color: string;
  isArchived: boolean;
}>;

export type BundleError = NameError | "invalid_color";

export function validateBundleInput(
  input: Readonly<{ name: string; color: string }>
): Result<{ name: string; color: string }, BundleError> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  if (!isPresetColor(input.color)) return err("invalid_color");
  return ok({ name: name.value, color: input.color });
}
