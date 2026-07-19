# Hitosuji（ひとすじ）

タスクシュート時間術を実践するためのシングルユーザー向けタスク管理Webアプリ。

- 仕様: [要求定義書](./docs/要求定義書.md) / [要件定義書](./docs/要件定義書.md) / [データモデル定義書](./docs/データモデル定義書.md) / [画面定義書](./docs/画面定義書/)
- 実装の進め方: [実装計画](./docs/実装計画.md)
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

テスト（アーキテクチャ・テスト戦略は [docs/アーキテクチャ定義書.md](./docs/アーキテクチャ定義書.md)）:

```bash
npm test                       # 全テスト（統合テストは db-test コンテナが必要）
npm run test:unit              # ユニットのみ
npm run test:int               # 統合のみ
```

## デプロイ（Vercel + Neon）

本番URL: **https://hitosuji-five.vercel.app**（Basic認証あり。`hitosuji.vercel.app` は他ユーザー取得済み）

1. GitHub にプライベートリポジトリを作成して push
2. [Neon](https://neon.tech) で無料プロジェクトを作成し、接続文字列を取得
3. 本番DBへスキーマ適用: `DATABASE_URL=<Neonの接続文字列> npm run db:migrate && DATABASE_URL=<同> npm run db:seed`
4. [Vercel](https://vercel.com) でリポジトリをインポートし、環境変数を設定
   - `DATABASE_URL`（Neon の接続文字列）
   - `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`（Basic認証。必ず設定する）
5. 以後は main への push で自動デプロイ。スキーマ変更時はデプロイ前に手動で `db:migrate` を実行する

## バックアップ（N-06）

週次で `pg_dump` を取得する（カスタム形式）:

```bash
pg_dump "$DATABASE_URL" -Fc -f hitosuji_$(date +%Y%m%d).dump
```

リストア（任意の Postgres へ可能）:

```bash
pg_restore -d "<リストア先の接続文字列>" hitosuji_YYYYMMDD.dump
```

GitHub Actions cron による自動化は Phase 1 完了時に整備する。
