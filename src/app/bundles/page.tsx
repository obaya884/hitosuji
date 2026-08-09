import { listBundles } from "@/usecases/bundle/bundle-usecases";
import { createBundleRepository } from "@/infrastructure/db/repositories/drizzle-bundle-repository";
import { BundlesBoard } from "./bundles-board";

export const dynamic = "force-dynamic";

export default async function BundlesPage() {
  const bundles = await listBundles(createBundleRepository());

  return (
    <>
      <h1 className="text-lg font-bold">バンドル</h1>
      <BundlesBoard bundles={bundles} />
    </>
  );
}
