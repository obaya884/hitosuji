# Hitosuji（ひとすじ）

タスクシュート時間術を実践するためのシングルユーザー向けタスク管理Webアプリ。オーナー本人が自分のために作り、自分だけで使っている。

- 仕様: [要求定義書](./docs/要求定義書.md) / [要件定義書](./docs/要件定義書.md) / [データモデル定義書](./docs/データモデル定義書.md) / [画面定義書](./docs/画面定義書/)
- 実装の進め方: [実装計画](./docs/実装計画.md) / [ユーザーフィードバック管理簿](./docs/ユーザーフィードバック.md)
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

テスト（アーキテクチャ・テスト戦略は [docs/アーキテクチャ定義書.md](./docs/アーキテクチャ定義書.md)）:

```bash
npm test                       # 全テスト（統合テストは db-test コンテナが必要）
npm run test:unit              # ユニットのみ
npm run test:int               # 統合のみ
```

## デプロイ（Vercel + Neon）

本番は Vercel（Hobby）+ Neon（Free）で運用している。

1. GitHub にリポジトリを作成して push
2. [Neon](https://neon.tech) で無料プロジェクトを作成し、接続文字列を取得
3. 本番DBへスキーマ適用: `DATABASE_URL=<Neonの接続文字列> npm run db:migrate && DATABASE_URL=<同> npm run db:seed`
4. [Vercel](https://vercel.com) でリポジトリをインポートし、環境変数を設定
   - `DATABASE_URL`（Neon の接続文字列）
   - `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`（Basic認証。必ず設定する）
5. 以後は main への push で自動デプロイ。スキーマ変更時はデプロイ前に手動で `db:migrate` を実行する

Vercel の GitHub 連携により、main 以外への push・PR には自動でプレビューデプロイが作られる（Dependabot の依存更新PR のビルド検証などに利用）。プレビューは本番DBに接続していない。

## バックアップ（N-06）

週次で `pg_dump` のカスタム形式を取得する。ローカルに Postgres クライアントを入れずに済むよう、`postgres:17-alpine` コンテナのクライアントを使う（本番 Neon と同じ 17 系。サーバより古いクライアントでは dump できない）。

### 取得

接続文字列は**コマンドライン引数に書かない**（シェル履歴に平文で残るため）。[CLAUDE.md](./CLAUDE.md) の「本番マイグレーションの手順」と同じく `.env.migrate` 経由で渡す。

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

### リストア実演の結果（2026-07-20）

本番から取得したダンプをローカルへ復元し、次を確認済み:

- 全テーブルの行数が本番と完全一致（sections 10 / modes 13 / projects 7 / routines 10 / routine_skips 0 / tasks 13 / マイグレーション履歴 2）
- マスタ・ルーチン・タスクの内容ハッシュ（md5）が本番と一致
- 復元DBへアプリを向けて、デイリー・ルーチン・マスタの各画面が本番と同じ内容で表示されること

GitHub Actions cron による自動化は実運用を開始してから検討する。

## ライセンス

コードとドキュメントで分けている。

| 対象 | ライセンス |
|---|---|
| ソースコード（`docs/` と `README.md` 以外） | [GNU AGPL-3.0-or-later](./LICENSE) |
| ドキュメント（`docs/` 配下、`README.md`） | [CC BY 4.0](./LICENSE-docs) |

コードを AGPL にしているのは、改変版をネットワーク越しのサービスとして提供する場合にもソースの公開を求めたいため。設計文書は散文なので、文書に適した CC BY 4.0 で、出典表示だけを条件に自由に使えるようにしている。
