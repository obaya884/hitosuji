#!/bin/sh
# 並行作業用 worktree の一括セットアップ（T-06）。設計は docs/仕様/16_git運用と並行開発体制定義書.md §1.2・§3・§5。
#
# 使い方:
#   npm run wt:new -- <ブランチ名> [起点]
#
# <ブランチ名> は <タスクID>-<slug>（小文字・a-z 0-9 - のみ・49文字以内。例 fb-54-section-jump）。
# worktree は ../hitosuji-wt/<ブランチ名> に作られ、テストDBは db-test コンテナ内の
# hitosuji_test_<ブランチ名の - を _ に置換> を使う。起点の既定は main。
#
# 注意: dev サーバ・実機確認はヘッド側（本体ワークツリー）で行う運用のため .env.local はコピーしない。
#       起点を最新にしたい場合は実行前に git fetch / pull しておくこと。
set -eu

name="${1:-}"
base="${2:-main}"

if [ -z "$name" ] || ! printf '%s' "$name" | grep -Eq '^[a-z0-9-]{1,49}$'; then
  echo "使い方: npm run wt:new -- <ブランチ名> [起点]" >&2
  echo "ブランチ名は小文字の a-z 0-9 - のみ・49文字以内（例: fb-54-section-jump）" >&2
  exit 1
fi

# 本体ワークツリー専用（worktree の中から実行するとパスが二重にネストするため）
if [ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]; then
  echo "wt:new は本体ワークツリー（ヘッド側）から実行してください" >&2
  exit 1
fi

wt_dir="../hitosuji-wt/$name"
db_name="hitosuji_test_$(printf '%s' "$name" | tr '-' '_')"

# 重い処理（worktree 作成・npm ci）より先にテストDBを用意し、失敗を早く安く倒す
docker compose up -d db-test
i=0
until docker compose exec -T db-test pg_isready -U hitosuji -q 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "db-test の起動を待ちきれませんでした（docker compose logs db-test を確認してください）" >&2
    exit 1
  fi
  sleep 1
done
if ! docker compose exec -T db-test psql -U hitosuji -d hitosuji_test -v ON_ERROR_STOP=1 -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$db_name'" | grep -q 1; then
  docker compose exec -T db-test psql -U hitosuji -d hitosuji_test -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $db_name"
fi

git worktree add "$wt_dir" -b "$name" "$base"
(cd "$wt_dir" && npm ci)

# vitest.config.ts が読む（シェルから渡された TEST_DATABASE_URL が常に優先）。値は開発用の固定資格情報のみ
printf 'TEST_DATABASE_URL=postgresql://hitosuji:hitosuji@localhost:5433/%s\n' "$db_name" > "$wt_dir/.env.worktree"

echo ""
echo "worktree を作成しました: ${wt_dir}（ブランチ: ${name} / テストDB: ${db_name}）"
echo "dev サーバ・実機確認はヘッド側（本体ワークツリー）で行ってください"
