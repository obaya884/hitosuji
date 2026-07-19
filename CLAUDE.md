# CLAUDE.md — Hitosuji 開発ガイド

## プロジェクト概要

タスクシュート時間術を実践するためのシングルユーザー向けタスク管理Webアプリ（TaskChute Cloud クローン）。オーナー本人だけが使う。仕様の一次情報は `docs/` 配下のドキュメント群。

## 最重要ルール: 仕様変更は docs/ 反映が先

挙動の契約はドキュメント群にある。実装中に挙動レベルの仕様判断が発生した場合、**コードより先に該当ドキュメントを更新する**。

- 要求: `docs/要求定義書.md`（F-XXX / N-XX の一覧）
- 要件・方式・フェーズ: `docs/要件定義書.md`
- データ構造・主要ロジック: `docs/データモデル定義書.md`
- 画面・操作・ショートカット: `docs/画面定義書/*.md`

## 技術スタック

Next.js 16 (App Router) + TypeScript / Tailwind CSS 4 / Drizzle ORM + node-postgres / PostgreSQL（ローカル: Docker(OrbStack)、本番: Neon 無料枠）/ Vercel 無料枠 / Basic認証（`proxy.ts`）

## アーキテクチャ

クリーンアーキテクチャ＋関数型DDD。**コード配置・依存方向・テスト戦略の契約は `docs/アーキテクチャ定義書.md` が正**。要点:

```
[ブラウザ] → HTTPS + Basic認証 (src/proxy.ts) → [Next.js App Router] → Drizzle → [PostgreSQL]

依存方向: domain ← application ← { infrastructure, presentation }（ESLint で強制）
```

### ディレクトリと責務

- `src/domain/` — 純粋な業務ロジック（採番・導出・展開判定等）。I/O・`new Date()` 禁止、すべて引数で受け取る。クラス不使用（`Readonly` type＋純関数）。業務的失敗は `Result`（`domain/shared/result.ts`）
- `src/application/` — ユースケース（1操作=1関数）＋ `ports/` にリポジトリIF。SQL を書かない
- `src/infrastructure/db/` — Drizzle スキーマ（データモデル定義書 §3 と1:1）・`repositories/` に Port 実装・migrations・seed・`testing/`（テストヘルパー）。トランザクション境界はリポジトリメソッド内
- `src/app/` — 画面（Server Component は表示日1日分＋マスタのみ取得）＋ Server Actions（更新の入口。合成ルートとしてリポジトリ実装をユースケースへ注入する）
- `src/proxy.ts` — Basic認証（Next.js 16 の middleware 相当）

### 設計原則（実装のたびに効く判断基準）

- **楽観的更新**（N-01）: 操作は即UIに反映 → Server Action で永続化。失敗時はトースト＋ロールバック。打刻・追加・並び替えは体感0msを目標
- **タスク状態は打刻から導出**（状態カラムなし）: 未実行 = started_at IS NULL / 実行中 = started_at あり・ended_at NULL / 完了 = ended_at あり
- **導出できる値はカラムに持たない**: セクション終了時刻・表示順（tasks.sort_order 以外）は導出。迷ったらデータモデル定義書 §1 の方針に従う
- **sort_order は間隔採番**: task_date ごとに独立、1000刻み、途中挿入は前後の中間値（データモデル定義書 §3.5）
- **ルーチン展開はデイリー表示時にサーバで冪等INSERT**: `ON CONFLICT (routine_id, task_date) WHERE routine_id IS NOT NULL DO NOTHING`。当日以降の日付のみ展開（§4.1）
- **実行中タスクは全体で最大1件**（アプリ層で保証）。割り込み・中断・複製の生成規則は要件定義書 §5.1/§5.2 が正
- **打刻はクライアントの現在時刻を送信**（サーバ時刻を使わない）
- **マスタは物理削除せずアーカイブ**（過去タスクからの参照を保つ）
- **task_date は保存された論理日付**。打刻時刻から導出しない（日界の将来導入に備える）

## サブエージェント運用（マルチエージェント体制）

実装サイクルの各段階で以下へ委譲し、メインセッションのコンテキストを実装そのものに集中させる。読み取り中心・出力が長くなる作業を委譲し、**コードの編集は常にメインセッションが行う**。

| 段階 | 委譲先 | 内容 |
|---|---|---|
| 着手前の調査 | 組み込み `Explore` | 既存コードの把握・影響範囲の特定（結論だけ受け取る） |
| 実装方式の設計 | 組み込み `Plan` | 実装方針の立案・トレードオフ整理（＝設計担当） |
| 実装の一区切り | `verifier` | lint / build / マイグレーション / シード / 疎通の機械的検証（＝テスト検証担当） |
| 機能の完成時 | `spec-reviewer` | docs/ 仕様書群との整合＋設計原則チェック |
| 節目のレビュー | `/code-review` | ブランチ全体のコードレビュー |

- **挙動レベルの仕様判断は委譲しない**。オーナーとの対話で決め、docs/ を先に更新する（最重要ルール参照）。`Plan` に委譲するのは実装方式レベルの設計のみ
- **実装は原則メインセッションが行う**（会話で決めた文脈を最も必要とする工程のため）。例外: 仕様がドキュメントで完結している自己完結的な `lib/` の純粋ロジックは、仕様条項を指定して `general-purpose` に実装委譲してよい
- `verifier` と `spec-reviewer` は独立なので**バックグラウンドで並列起動**し、結果を待つ間に次の作業を進めてよい
- 軽微な変更（typo・文言・1ファイルの小修正）ではエージェントを起動せず、メインセッションで直接 lint/build する
- レビュー・検証エージェントの指摘への対処（修正）はメインセッションが行い、必要なら同じエージェントに再検証させる

## 開発コマンド

- `docker compose up -d` — ローカルDB起動（開発用 :5432 とテスト用 db-test :5433。OrbStack が必要）
- `npm run dev` — 開発サーバ（http://localhost:3000）
- `npm test` — 全テスト / `test:unit` ユニットのみ / `test:int` 統合のみ（要 db-test）/ `test:watch`
- `npm run db:generate` — スキーマ変更からマイグレーション生成
- `npm run db:migrate` — マイグレーション適用
- `npm run db:seed` — 初期データ投入（冪等）
- `npm run db:studio` — Drizzle Studio（DB閲覧）
- `npm run build` / `npm run lint`

## 環境変数（`.env.local` / Vercel）

- `DATABASE_URL` — Postgres 接続文字列
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` — 両方設定すると Basic認証が有効。未設定なら素通し（ローカル開発用）。**リポジトリにコミットしない**

## 規約

- UI文言・ドキュメント・コミットメッセージは日本語
- コミットは Conventional Commits（`feat:` `fix:` `docs:` `chore:` 等）＋日本語サマリ
- UIは装飾を排したシンプルなテーブル型リスト（N-05）。コンポーネントライブラリは使わない。モーダルは最小限、インライン編集を基本とする
- キーボードショートカットは画面定義書01 §6 が正。修飾キーは Shift のみ、preventDefault は最小化
- マイグレーションは Drizzle Kit で管理し、本番適用はデプロイ前に手動実行
- テストは古典学派（モック原則不使用）・テストピラミッド。コロケーション配置、ユニット `*.test.ts` / 統合 `*.int.test.ts`。domain のテスト名には対応する仕様条項を書く。詳細はアーキテクチャ定義書 §8
