# Hitosuji（ひとすじ）

タスクシュート時間術を実践するためのシングルユーザー向けタスク管理Webアプリ。オーナー本人が自分のために作り、自分だけで使っている。

- 仕様: [要求定義書](./docs/仕様/11_要求定義書.md) / [要件定義書](./docs/仕様/12_要件定義書.md) / [データモデル定義書](./docs/仕様/14_データモデル定義書.md) / [画面定義書](./docs/仕様/13_画面定義書/) / [アーキテクチャ定義書](./docs/仕様/15_アーキテクチャ定義書.md) / [git運用と並行開発体制定義書](./docs/仕様/16_git運用と並行開発体制定義書.md) / [テスト戦略定義書](./docs/仕様/17_テスト戦略定義書.md)
- 案件の管理: [要件バックログ](./docs/案件/22_要件バックログ.md)（プロダクト軸）/ [技術改善バックログ](./docs/案件/23_技術改善バックログ.md)（技術軸）/ [ユーザーフィードバック管理簿](./docs/案件/21_ユーザーフィードバック.md)（FB 軸）/ [実装計画](./docs/案件/archive_24_実装計画.md)（MVP 期アーカイブ）。各台帳の完了分は同階層の `closed_*`、FB の着手手順は [guide_21](./docs/案件/guide_21_ユーザーフィードバック.md)
- 開発規約・アーキテクチャ: [CLAUDE.md](./CLAUDE.md)

## 開発環境セットアップ

```bash
brew install --cask orbstack   # Docker ランタイム（初回のみ）
docker compose up -d           # ローカル PostgreSQL 起動
npm install
# .env.local を作り、.env.example の値の行だけを写す（ヘッダはコピーしない）
npm run db:migrate             # スキーマ適用
npm run db:seed                # 初期データ（セクション・モード）
npm run dev                    # http://localhost:3000
```

ファビコンは環境で色が変わる（要件定義書 §2.3 / FB-17）。**本番は紺・ローカルは琥珀**なので、両方をタブで開いていても見分けられる（判定は `VERCEL_ENV`。実体は `src/app/icon.tsx`）。

テスト（テスト戦略は [docs/仕様/17_テスト戦略定義書.md](./docs/仕様/17_テスト戦略定義書.md)、アーキテクチャは [docs/仕様/15_アーキテクチャ定義書.md](./docs/仕様/15_アーキテクチャ定義書.md)）:

```bash
npm test                       # 全テスト（統合テストは db-test コンテナが必要）
npm run test:unit              # ユニットのみ
npm run test:component         # コンポーネントのみ（jsdom）
npm run test:int               # 統合のみ
```

UI の挙動を実ブラウザで測るときは、確認専用の環境を立てる（自動テストではない。T-37）:

```bash
npm run dev:check              # http://localhost:3100
```

確認専用DB（`hitosuji_check`。使い捨ての db-test コンテナ内）を作り直してフィクスチャを入れ、そこへ向けて dev サーバを起動する。**開発DB（:5432）には接続しない**ので、打刻・削除・複製を自由に試してよい。**データを元に戻すには `Ctrl+C` で止めて再実行する**（起動のたびに入れ直される）。

PR と main への push では GitHub Actions（`.github/workflows/ci.yml`）が lint・build・カバレッジ付きテスト（`test:coverage`）を自動実行し、層別のカバレッジ集計を PR コメントとジョブサマリへ出す（統合テストは Postgres サービスコンテナを建てる。読み方は[テスト戦略定義書](./docs/仕様/17_テスト戦略定義書.md) §7）。Dependabot の依存更新PRもここで検証される。技術改善・負債返済などの活動は [技術改善バックログ](./docs/案件/23_技術改善バックログ.md) で管理する。

## デプロイ（Vercel + Neon）

本番は Vercel（Hobby）+ Neon（Free）で運用している。

1. GitHub にリポジトリを作成して push
2. [Neon](https://neon.tech) で無料プロジェクトを作成し、接続文字列を取得
3. 本番DBへスキーマ適用: `DATABASE_URL=<Neonの接続文字列> npm run db:migrate && DATABASE_URL=<同> npm run db:seed`
4. [Vercel](https://vercel.com) でリポジトリをインポートし、環境変数を設定
   - `DATABASE_URL`（Neon の接続文字列）
   - `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`（Basic認証。必ず設定する）
5. 以後は main への push で自動デプロイ。スキーマ変更時はデプロイ前にマイグレーションを適用する（→「スキーマ更新（本番マイグレーション）」節）

Vercel の GitHub 連携により、main 以外への push・PR には自動でプレビューデプロイが作られる（Dependabot の依存更新PR のビルド検証などに利用）。プレビューは本番DBに接続していない。

## スキーマ更新（本番マイグレーション）

**マージ＝本番デプロイ**なので、スキーマ変更を含む PR は**マージ前に本番へマイグレーションを適用する**（順序: `migrate → マージ（デプロイ）`。逆順だと新コードが未作成テーブルを参照して壊れる）。

新規マイグレーション（`src/infrastructure/db/migrations/*.sql`）を含む PR には、CI が自動で**「スキーマ更新」ラベル**と**実行を促す注意コメント**を付ける（[技術改善バックログ完了記録](./docs/案件/closed_23_技術改善バックログ.md) T-21）。適用は次のどちらか。方式・設計の背景は [docs/検討/32_スキーマ更新パイプライン検討.md](./docs/検討/32_スキーマ更新パイプライン検討.md)（T-22。案A を採用し、自動化の案B・Cは個人開発の規模では過剰につき見送り）。

### リモート（推奨）

Actions → **DB migrate (production)** → **Run workflow** で、**その PR のブランチ**を選んで実行（`confirm` に `migrate` と入力）→ `db-migrate` Environment の承認 → 成功を確認 → **マージ**。

前提設定（初回のみ・GitHub 側。migrate 専用の Environment を Vercel の "Production" とは分けて用意する）:

- Settings → Environments → **`db-migrate`** を作成し、**Required reviewers** にオーナーを設定（承認ゲート）
- Secret **`MIGRATE_DATABASE_URL`** = Neon の接続文字列（**Pooled を外した unpooled**）を登録
- Deployment branches は制限しない（PR ブランチから実行するため。理由は検討ドキュメント §3）

### ローカル

接続文字列を**コマンドライン引数に書かない**（履歴に平文で残るため）。`.env.migrate` 経由で渡す。

1. Neon コンソール → Connection Details から接続文字列を取得（**Pooled connection のチェックを外す**）
2. `.env.migrate` に `DATABASE_URL='...'` の1行で保存（`&` を含むためシングルクォート必須。`vercel env pull` では取れない＝Sensitive）
3. `set -a; . ./.env.migrate; set +a; npm run db:migrate`
4. `migrations applied successfully!` を確認したら `.env.migrate` を削除し、**マージ**

## バックアップ（N-06）

週次で `pg_dump` のカスタム形式を取得する。ローカルに Postgres クライアントを入れずに済むよう、`postgres:17-alpine` コンテナのクライアントを使う（本番 Neon と同じ 17 系。サーバより古いクライアントでは dump できない）。

### 取得

接続文字列は**コマンドライン引数に書かない**（シェル履歴に平文で残るため）。「スキーマ更新（本番マイグレーション）」のローカル手順と同じく `.env.migrate` 経由で渡す。

```bash
# Neon コンソール → Connection Details（Pooled のチェックを外す）で取得した接続文字列を
# .env.migrate に DATABASE_URL='...' の1行で保存してから
set -a; . ./.env.migrate; set +a
npm run db:backup            # backups/hitosuji_YYYYMMDD_HHMMSS.dump が生成される
```

`backups/` は `.gitignore` 済み（本番の実データを含むためコミットしない）。取得後は `.env.migrate` を削除する。

### 復元

```bash
npm run db:restore -- backups/hitosuji_YYYYMMDD_HHMMSS.dump   # 復元先の既定は hitosuji_restore
npm run db:restore -- backups/<ファイル> <復元先DB名>          # 復元先を指定する場合
```

ローカルの `db` コンテナに復元先DBを作り直して流し込む。

### 開発DBへ本番のマスタ・ルーチンだけを入れる（FB-18）

本番と同じセクション・モード・プロジェクト・ルーチンで開発したいとき使う。**タスク（ログ）は持ち込まない**（ルーチン展開で生成されるため）。

```bash
npm run db:backup             # 先に本番のダンプを取る
npm run db:sync-masters       # backups/ の最新ダンプを開発用の hitosuji へ
npm run db:sync-masters -- backups/hitosuji_YYYYMMDD_HHMMSS.dump [対象DB名]   # 明示指定
```

ダンプを省略すると `backups/` の最新（更新時刻順）を使う。バックアップを定期実行にすれば、手元では引数なしで最新に追随できる。

対象DBのマスタ・ルーチンは**洗い替え**になり、それらを参照する開発用のタスクも消える（実行前に確認プロンプトが出る）。スキーマはマイグレーションで作った側を正とし、データのみを流し込む（`--data-only`）。部分リストアではシーケンスが進まないため、実行後に各テーブルの最大IDへ合わせ直している。Neon のロール（`neondb_owner`）はローカルに存在しないため `--no-owner --no-privileges` を付けている（この2つがないと所有者エラーになる）。他の Postgres へ移す場合も同じダンプをそのまま `pg_restore` できる（N-06② ロックイン回避）。

### 自動化

GitHub Actions cron による自動化は暗号化方式を確定済み（`age` 非対称暗号）・保存先は2案併記で保留（R2/B2 or S3/GCS+OIDC）。方式・設計は [docs/検討/33_データバックアップ自動化検討.md](./docs/検討/33_データバックアップ自動化検討.md)（T-25）が正。実装は運用の負担を見てから着手する。

## ライセンス

コードとドキュメントで分けている。

| 対象 | ライセンス |
|---|---|
| ソースコード（`docs/` と `README.md` 以外） | [GNU AGPL-3.0-or-later](./LICENSE) |
| ドキュメント（`docs/` 配下、`README.md`） | [CC BY 4.0](./LICENSE-docs) |

コードを AGPL にしているのは、改変版をネットワーク越しのサービスとして提供する場合にもソースの公開を求めたいため。設計文書は散文なので、文書に適した CC BY 4.0 で、出典表示だけを条件に自由に使えるようにしている。
