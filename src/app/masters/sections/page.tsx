import { listSections } from "@/usecases/section/section-usecases";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { SectionsTable } from "./sections-table";

export const dynamic = "force-dynamic";

export default async function SectionsPage() {
  const view = await listSections(createSectionRepository());

  return (
    <SectionsTable
      ranges={view.ranges.map((r) => ({ ...r.section, endTime: r.endTime }))}
      archived={[...view.archived]}
    />
  );
}
