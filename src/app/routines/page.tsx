import { listModes } from "@/usecases/mode/mode-usecases";
import { listProjects } from "@/usecases/project/project-usecases";
import { listRoutines } from "@/usecases/routine/routine-usecases";
import { listSections } from "@/usecases/section/section-usecases";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { dayStartTimeOf } from "@/domain/section/section";
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
        // 表示（名前の引き当て）にはアーカイブ済みも要る。選択肢には出さない（画面定義書03 §4）
        allModes={[...modeView.active, ...modeView.archived]}
        allProjects={[...projectView.active, ...projectView.archived]}
        sections={sectionView.ranges.map((r) => r.section)}
        // 「今日」は日界（F-116）を踏まえる。展開済み一覧の読み込みで得たセクションから導出する
        today={todayLogicalDate(new Date(), dayStartTimeOf(sectionView.ranges.map((r) => r.section)))}
      />
    </>
  );
}
