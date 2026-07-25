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
# dev サーバは worktree ごとに固有ポート（3001 から空きを探す）で起動できる。本体の .env.local を
# リンクし、開発DB（:5432）は本体と共有する。起動はオーナーが自分のターミナルで行う（§3.2）。
# 起点を最新にしたい場合は実行前に git fetch / pull しておくこと。
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

# dev サーバ用の空きポートを 3001 から探す（T-34）。本体の :3000 とは必ず別にする
dev_port=3001
while [ "$dev_port" -lt 3100 ] && lsof -ti:"$dev_port" >/dev/null 2>&1; do
  dev_port=$((dev_port + 1))
done

# vitest.config.ts が TEST_DATABASE_URL を、scripts/dev.sh が DEV_PORT を読む
# （どちらもシェルから渡された値が優先）。値は開発用の固定資格情報とポートのみ
{
  printf 'TEST_DATABASE_URL=postgresql://hitosuji:hitosuji@localhost:5433/%s\n' "$db_name"
  printf 'DEV_PORT=%s\n' "$dev_port"
} > "$wt_dir/.env.worktree"

# dev サーバは本体の .env.local（DATABASE_URL 等）を参照する。コピーではなくリンクにして
# 資格情報の実体を1か所に保つ（.gitignore の .env* でリンクも git から外れる）。
# 開発DBは本体と共有する（worktree ごとに複製しない。§3.2）
env_local="$(pwd)/.env.local"
if [ -f "$env_local" ]; then
  ln -s "$env_local" "$wt_dir/.env.local"
else
  echo "警告: 本体に .env.local がないため dev サーバ用のリンクを張れませんでした（テストには影響しません）" >&2
fi

echo ""
echo "worktree を作成しました: ${wt_dir}（ブランチ: ${name} / テストDB: ${db_name}）"
echo "dev サーバ: cd ${wt_dir} && npm run dev  →  http://localhost:${dev_port}"
echo "  開発DBは本体と共有します。同時に打刻・削除すると互いに干渉するので、データを触る確認は1つずつ行ってください"
