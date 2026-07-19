// 暫定ページのため infrastructure を直接参照している（アーキテクチャ定義書 §9 の例外。S-03 実装時に解消）
import { db } from "@/infrastructure/db";
import { sections } from "@/infrastructure/db/schema";

export const dynamic = "force-dynamic";

export default async function Home() {
  let dbStatus: { ok: boolean; message: string };
  try {
    const rows = await db.select().from(sections);
    dbStatus = { ok: true, message: `DB接続OK（sections: ${rows.length}件）` };
  } catch (e) {
    dbStatus = {
      ok: false,
      message: `DB未接続: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Hitosuji（ひとすじ）</h1>
      <p className="mt-2 text-sm text-gray-500">
        セットアップ確認ページ（Phase 1 実装開始時にデイリーリストへ置き換える）
      </p>
      <p
        className={`mt-6 rounded border p-4 text-sm ${
          dbStatus.ok
            ? "border-green-300 bg-green-50 text-green-800"
            : "border-red-300 bg-red-50 text-red-800"
        }`}
      >
        {dbStatus.message}
      </p>
    </main>
  );
}
