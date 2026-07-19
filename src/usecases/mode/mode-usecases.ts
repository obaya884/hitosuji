// モード管理のユースケース（S-03 / 画面定義書03 §3.2）
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import { validateModeInput, type Mode, type ModeError, type ModeId } from "@/domain/mode/mode";
import { sortByName } from "@/domain/shared/name-order";
import { ok, type Result } from "@/domain/shared/result";

export type ModeListView = Readonly<{
  active: readonly Mode[];
  archived: readonly Mode[];
}>;

export async function listModes(repo: ModeRepository): Promise<ModeListView> {
  const all = sortByName(await repo.listAll());
  return {
    active: all.filter((m) => !m.isArchived),
    archived: all.filter((m) => m.isArchived),
  };
}

export async function createMode(
  repo: ModeRepository,
  input: Readonly<{ name: string; color: string }>
): Promise<Result<Mode, ModeError>> {
  const validated = validateModeInput(input);
  if (!validated.ok) return validated;
  return ok(await repo.create(validated.value));
}

export async function updateMode(
  repo: ModeRepository,
  id: ModeId,
  input: Readonly<{ name: string; color: string }>
): Promise<Result<ModeId, ModeError>> {
  const validated = validateModeInput(input);
  if (!validated.ok) return validated;
  await repo.update(id, validated.value);
  return ok(id);
}

export async function setModeArchived(
  repo: ModeRepository,
  id: ModeId,
  isArchived: boolean
): Promise<Result<ModeId, ModeError>> {
  await repo.setArchived(id, isArchived);
  return ok(id);
}
