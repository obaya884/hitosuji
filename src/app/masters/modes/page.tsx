import { listModes } from "@/usecases/mode/mode-usecases";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { ModesTable } from "./modes-table";

export const dynamic = "force-dynamic";

export default async function ModesPage() {
  const view = await listModes(createModeRepository());
  return <ModesTable active={[...view.active]} archived={[...view.archived]} />;
}
