import { listBundles } from "@/usecases/bundle/bundle-usecases";
import { listModes } from "@/usecases/mode/mode-usecases";
import { listRoutines } from "@/usecases/routine/routine-usecases";
import { createBundleRepository } from "@/infrastructure/db/repositories/drizzle-bundle-repository";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { BundlesBoard } from "./bundles-board";

export const dynamic = "force-dynamic";

export default async function BundlesPage() {
  const [bundles, routines, modeView] = await Promise.all([
    listBundles(createBundleRepository()),
    listRoutines(createRoutineRepository()),
    listModes(createModeRepository()),
  ]);

  return (
    <>
      <h1 className="text-lg font-bold">バンドル</h1>
      <BundlesBoard
        bundles={bundles}
        routines={routines}
        // メンバー表の表示（名前の引き当て）にはアーカイブ済みモードも要る（routines/page.tsx と同じ理由）
        modes={[...modeView.active, ...modeView.archived]}
      />
    </>
  );
}
