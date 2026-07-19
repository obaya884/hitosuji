import { listModes } from "@/usecases/mode/mode-usecases";
import { listProjects } from "@/usecases/project/project-usecases";
import { listRoutines } from "@/usecases/routine/routine-usecases";
import { listSections } from "@/usecases/section/section-usecases";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { RoutinesTable } from "./routines-table";
import { todayLogicalDate } from "../_lib/format";

export const dynamic = "force-dynamic";

export default async function RoutinesPage() {
  const [routines, modeView, projectView, sectionView] = await Promise.all([
    listRoutines(createRoutineRepository()),
    listModes(createModeRepository()),
    listProjects(createProjectRepository()),
    listSections(createSectionRepository()),
  ]);

  return (
    <>
      <h1 className="text-lg font-bold">ルーチン</h1>
      <RoutinesTable
        routines={routines}
        modes={[...modeView.active]}
        projects={[...projectView.active]}
        sections={sectionView.ranges.map((r) => r.section)}
        today={todayLogicalDate()}
      />
    </>
  );
}
