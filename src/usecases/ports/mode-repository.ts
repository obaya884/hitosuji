import type { Mode, ModeId } from "@/domain/mode/mode";

export type ModeInput = Readonly<{ name: string; color: string }>;

export type ModeRepository = Readonly<{
  listAll(): Promise<Mode[]>;
  create(input: ModeInput): Promise<Mode>;
  update(id: ModeId, input: ModeInput): Promise<void>;
  setArchived(id: ModeId, isArchived: boolean): Promise<void>;
  /** 各モードを参照するタスク・ルーチンの件数（画面定義書03 §4.1）。参照0件の id は省略されうる */
  referenceCounts(ids: readonly ModeId[]): Promise<Readonly<Record<ModeId, number>>>;
  remove(id: ModeId): Promise<void>;
}>;
