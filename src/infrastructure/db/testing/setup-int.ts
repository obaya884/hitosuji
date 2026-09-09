// 統合段（`*.int.test.ts`）の前提。**テストファイルより先に走る**ので、
// ここで `DATABASE_URL` を差し替えておけば、以降に読み込まれる本番モジュールもテストDBを向く。
//
// これが要るのは Server Action を叩くテスト（T-112）。`actions.ts` は
// **モジュール読み込み時に** `createTaskRepository()` を呼び、引数を省いた既定として
// `infrastructure/db/index.ts` の接続（`DATABASE_URL`）を掴む——注入の口が無いので、
// 環境変数の側でテストDBへ向けるしかない。
//
// **リポジトリの統合テストには影響しない**（あちらは `createTestDb()` で自前の接続を作る）。
// 逆に言えば、この保証が効くのは `setupFiles` を持つ統合段だけ（他の段は `DATABASE_URL` を設定しない）。
//
// **このプールは意図的に閉じない**。`db/index.ts` は `globalThis` にキャッシュするので、
// テストファイルごとの `afterAll` で閉じるとプロセスを再利用したときに次のファイルが
// 「Cannot use a pool after calling end」で落ちる。プロセス終了で回収されるのに任せる
import { TEST_DATABASE_URL } from "./test-db";

process.env.DATABASE_URL = TEST_DATABASE_URL;
