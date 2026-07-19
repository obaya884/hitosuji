// プロジェクト集約（データモデル定義書 §3.3 / 画面定義書03 §3.3）
import { validateName, type NameError } from "../shared/master-name";
import { ok, type Result } from "../shared/result";

export type ProjectId = number;

export type Project = Readonly<{
  id: ProjectId;
  name: string;
  isArchived: boolean;
}>;

export type ProjectError = NameError;

export function validateProjectInput(
  input: Readonly<{ name: string }>
): Result<{ name: string }, ProjectError> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  return ok({ name: name.value });
}
