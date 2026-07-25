#!/bin/sh
# 並行作業用 worktree の一括セットアップ（T-06）。設計は docs/検討/34_git運用と並行開発体制検討.md §5・§7。
#
# 使い方:
#   npm run wt:new -- <ブランチ名> [起点]
#
# <ブランチ名> は <タスクID>-<slug>（小文字・a-z 0-9 - のみ。例 fb-54-section-jump）。
# worktree は ../hitosuji-wt/<ブランチ名> に作られ、テストDBは db-test コンテナ内の
# hitosuji_test_<ブランチ名の - を _ に置換> を使う。起点の既定は main。
#
# 注意: dev サーバ・実機確認はヘッド側（本体ワークツリー）で行う運用のため .env.local はコピーしない。
set -eu

name="${1:-}"
base="${2:-main}"

if [ -z "$name" ] || ! printf '%s' "$name" | grep -Eq '^[a-z0-9-]+$'; then
  echo "使い方: npm run wt:new -- <ブランチ名> [起点]" >&2
  echo "ブランチ名は小文字の a-z 0-9 - のみ（例: fb-54-section-jump）" >&2
  exit 1
fi

wt_dir="../hitosuji-wt/$name"
db_name="hitosuji_test_$(printf '%s' "$name" | tr '-' '_')"

git worktree add "$wt_dir" -b "$name" "$base"
(cd "$wt_dir" && npm ci)

# worktree 専用のテストDBを db-test コンテナ内に作る（スキーマは統合テストの globalSetup が適用する）
docker compose up -d db-test
if ! docker compose exec -T db-test psql -U hitosuji -d hitosuji_test -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$db_name'" | grep -q 1; then
  docker compose exec -T db-test createdb -U hitosuji "$db_name"
fi

# vitest.config.ts が読む（シェルから渡された TEST_DATABASE_URL が常に優先）。値は開発用の固定資格情報のみ
printf 'TEST_DATABASE_URL=postgresql://hitosuji:hitosuji@localhost:5433/%s\n' "$db_name" > "$wt_dir/.env.worktree"

echo ""
echo "worktree を作成しました: ${wt_dir}（ブランチ: ${name} / テストDB: ${db_name}）"
echo "dev サーバ・実機確認はヘッド側（本体ワークツリー）で行ってください"
