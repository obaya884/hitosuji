import { listBundles } from "@/usecases/bundle/bundle-usecases";
import { listRoutines } from "@/usecases/routine/routine-usecases";
import { createBundleRepository } from "@/infrastructure/db/repositories/drizzle-bundle-repository";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import type { BundleId } from "@/domain/bundle/bundle";
import { BundlesBoard } from "./bundles-board";

export const dynamic = "force-dynamic";

export default async function BundlesPage() {
  const [bundles, routines] = await Promise.all([
    listBundles(createBundleRepository()),
    listRoutines(createRoutineRepository()),
  ]);

  // 左ペインのメンバー件数（画面定義書05 §3.1）。メンバー表そのものは Task 10 で足すため、
  // ここでは既存の listRoutines から bundleId で数えるだけに留める
  const memberCounts: Record<BundleId, number> = {};
  for (const routine of routines) {
    if (routine.bundleId === null) continue;
    memberCounts[routine.bundleId] = (memberCounts[routine.bundleId] ?? 0) + 1;
  }

  return (
    <>
      <h1 className="text-lg font-bold">バンドル</h1>
      <BundlesBoard bundles={bundles} memberCounts={memberCounts} />
    </>
  );
}
