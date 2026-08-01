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

. "$(dirname "$0")/lib/port.sh"

# シェルから渡された DEV_PORT が常に優先（.env.worktree はワークツリー既定値）
if [ -z "${DEV_PORT:-}" ] && [ -f .env.worktree ]; then
  DEV_PORT="$(sed -n 's/^DEV_PORT=\([0-9]\{1,\}\)$/\1/p' .env.worktree)"
fi

if [ -n "${DEV_PORT:-}" ]; then
  # 割り当てポートが埋まっていると next は黙って別のポートへ流れ、wt:new が表示した URL が
  # 嘘になる。よくある原因は本体（:3000）が塞がれて 3001 以降へフォールバックしていること
  if lsof -ti:"$DEV_PORT" >/dev/null 2>&1; then
    echo "警告: 割り当てポート :${DEV_PORT} は既に使用中です。next は別のポートで起動します" >&2
    echo "  :${DEV_PORT} を掴んでいるのは次のプロセスです（本体の dev サーバが流れてきていないか確認してください）" >&2
    print_port_holders "$DEV_PORT" "    "
  fi
  exec npx next dev -p "$DEV_PORT"
fi

# 本体ワークツリー。:3000 が埋まっていると next は 3001 以降へ流れるが、そこは worktree の
# 割り当て範囲なので取り合いになる。気づけるように警告だけ出す（起動は止めない）
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "警告: :3000 が使用中のため next は 3001 以降へ流れます。そこは worktree の割り当て範囲です" >&2
  echo "  古い dev サーバが残っていないか確認してください: lsof -ti:3000" >&2
fi

exec npx next dev
