import type { Section, SectionId } from "@/domain/section/section";

export type SectionInput = Readonly<{ name: string; startTime: string }>;

export type SectionRepository = Readonly<{
  listAll(): Promise<Section[]>;
  create(input: SectionInput): Promise<Section>;
  update(id: SectionId, input: SectionInput): Promise<void>;
  setArchived(id: SectionId, isArchived: boolean): Promise<void>;
}>;
