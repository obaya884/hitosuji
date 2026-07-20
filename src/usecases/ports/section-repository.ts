import type { Section, SectionId } from "@/domain/section/section";

export type SectionInput = Readonly<{ name: string; startTime: string }>;

export type SectionRepository = Readonly<{
  listAll(): Promise<Section[]>;
  create(input: SectionInput): Promise<Section>;
  update(id: SectionId, input: SectionInput): Promise<void>;
  setArchived(id: SectionId, isArchived: boolean): Promise<void>;
  /** 各セクションを参照するタスクの件数（画面定義書03 §4.1。ルーチンはセクションを参照しない） */
  referenceCounts(ids: readonly SectionId[]): Promise<Readonly<Record<SectionId, number>>>;
  remove(id: SectionId): Promise<void>;
}>;
