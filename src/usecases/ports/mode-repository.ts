import type { Mode, ModeId } from "@/domain/mode/mode";

export type ModeInput = Readonly<{ name: string; color: string }>;

export type ModeRepository = Readonly<{
  listAll(): Promise<Mode[]>;
  create(input: ModeInput): Promise<Mode>;
  update(id: ModeId, input: ModeInput): Promise<void>;
  setArchived(id: ModeId, isArchived: boolean): Promise<void>;
}>;
