#!/bin/sh
# dev サーバの起動ラッパ（T-34）。設計は docs/仕様/16_git運用と並行開発体制定義書.md §3.2。
#
# 本体ワークツリーでは素の `next dev`（:3000）と同じ。worktree では wt-new.sh が
# .env.worktree に書いた DEV_PORT を読み、worktree ごとの固有ポートで起動する。
#
# next dev のポートはプロセス起動時のシェル環境か -p でしか決まらず、Next.js の
# env ファイル読み込み（.env.local 等）はサーバがポートを決めた後に走るため、
# .env.worktree に書くだけでは効かない。このラッパで先に読んで -p に渡す。
set -eu

# シェルから渡された DEV_PORT が常に優先（.env.worktree はワークツリー既定値）
if [ -z "${DEV_PORT:-}" ] && [ -f .env.worktree ]; then
  DEV_PORT="$(sed -n 's/^DEV_PORT=\([0-9]\{1,\}\)$/\1/p' .env.worktree)"
fi

if [ -n "${DEV_PORT:-}" ]; then
  exec npx next dev -p "$DEV_PORT"
fi

exec npx next dev
