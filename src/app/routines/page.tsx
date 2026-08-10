import { listBundles } from "@/usecases/bundle/bundle-usecases";
import { listModes } from "@/usecases/mode/mode-usecases";
import { listProjects } from "@/usecases/project/project-usecases";
import { listRoutines } from "@/usecases/routine/routine-usecases";
import { listSections } from "@/usecases/section/section-usecases";
import { todayFromSections } from "@/usecases/section/resolve-today";
import { createBundleRepository } from "@/infrastructure/db/repositories/drizzle-bundle-repository";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { RoutinesTable } from "./routines-table";

export const dynamic = "force-dynamic";

export default async function RoutinesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ edit?: string }> }>) {
  const [routines, bundleView, modeView, projectView, sectionView] = await Promise.all([
    listRoutines(createRoutineRepository()),
    listBundles(createBundleRepository()),
    listModes(createModeRepository()),
    listProjects(createProjectRepository()),
    listSections(createSectionRepository()),
  ]);

  // S-05 のメンバー名リンク（`/routines?edit=<id>`）の着地点（画面定義書05 O-8）
  const editParam = (await searchParams).edit;
  const initialEditingId = editParam === undefined ? null : Number(editParam);

  return (
    <>
      <h1 className="text-lg font-bold">ルーチン</h1>
      <RoutinesTable
        routines={routines}
        bundles={[...bundleView.active]}
        modes={[...modeView.active]}
        projects={[...projectView.active]}
        // 表示（名前の引き当て）にはアーカイブ済みも要る。選択肢には出さない（画面定義書02 §4）
        allBundles={[...bundleView.active, ...bundleView.archived]}
        allModes={[...modeView.active, ...modeView.archived]}
        allProjects={[...projectView.active, ...projectView.archived]}
        sections={sectionView.ranges.map((r) => r.section)}
        // 「今日」は日界（F-116）を踏まえる。読み込み済みのセクションから導出する（二重 fetch を避ける）
        today={todayFromSections(
          sectionView.ranges.map((r) => r.section),
          new Date()
        )}
        initialEditingId={initialEditingId}
      />
    </>
  );
}
