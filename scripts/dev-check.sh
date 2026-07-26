#!/bin/sh
# ブラウザ実機確認（T-37）用の dev サーバを立てる。設計は docs/案件/23_技術改善バックログ.md T-37。
#
# 確認専用DBを db-test インスタンス（:5433・tmpfs）の中に作り、そこへ向けた dev サーバを
# 固定ポートで起動する。**実データを持つ開発DB（:5432）には触れない**——開発DBには
# db:sync-masters で本番のマスタ・ルーチンが入るため、エージェントの報告やスクリーン
# ショット経由で実名が public リポジトリへ流出する危険がある（CLAUDE.md「このリポジトリは public」）。
#
# 毎回 TRUNCATE してフィクスチャを入れ直すので、確認は常に同じ状態から始まる。
set -eu

DB_NAME=hitosuji_check
# 統合テストと同じインスタンスを使うが DB は別（hitosuji_test / hitosuji_test_* とは干渉しない）
CHECK_DATABASE_URL="postgresql://hitosuji:hitosuji@localhost:5433/${DB_NAME}"
# worktree の割り当ては 3001〜3099（scripts/wt-new.sh）。その外側を使う
CHECK_DEV_PORT=3100

# **確認環境は機械全体で1本まで**。DB名もポートも固定なので、worktree ごとに分かれる
# テストDB（hitosuji_test_<ブランチ>）とは違い、2本目は1本目のデータを TRUNCATE で壊す。
# このポート確認が DB に触る前に走ることが唯一の歯止めなので、**下の docker/migrate/
# フィクスチャより前から動かさないこと**（並行開発時はヘッド・ワーカーのどちらが使うかを
# 先に決める。仕様16 §2）
if lsof -ti:"$CHECK_DEV_PORT" >/dev/null 2>&1; then
  echo "確認用ポート :${CHECK_DEV_PORT} は既に使用中です（確認環境は機械全体で1本まで。先に起動した dev:check が残っていないか確認してください）" >&2
  lsof -ti:"$CHECK_DEV_PORT" | while read -r pid; do
    echo "  PID ${pid}: $(ps -o command= -p "$pid" 2>/dev/null | cut -c1-60)" >&2
  done
  exit 1
fi

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

# tmpfs なので docker compose down のたびに消える。無ければ作る
if ! docker compose exec -T db-test psql -U hitosuji -d hitosuji_test -v ON_ERROR_STOP=1 -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  docker compose exec -T db-test psql -U hitosuji -d hitosuji_test -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $DB_NAME"
fi

# DATABASE_URL はシェルから渡した値が .env.local より優先される（dotenv も Next.js も既存の
# 環境変数を上書きしない）。確認用DB以外を向く事故が起きない形にしておく
DATABASE_URL="$CHECK_DATABASE_URL" npx drizzle-kit migrate
DATABASE_URL="$CHECK_DATABASE_URL" npx tsx src/infrastructure/db/testing/browser-check-fixtures.ts

echo ""
echo "ブラウザ確認用の dev サーバを起動します: http://localhost:${CHECK_DEV_PORT}"
echo "  DB: ${DB_NAME}（db-test インスタンス内。実データを持つ開発DBには接続しません）"
echo "  データは起動のたびに入れ直されます。破壊的操作（打刻・削除・複製）を試して構いません"
echo "  データを元に戻すには: Ctrl+C で止めて npm run dev:check をもう一度実行してください"
echo ""
# NEXT_DIST_DIR は next.config.ts が読む。本体の dev サーバ（:3000）と .next を
# 共有すると2つの next dev が同じ場所へ書き合うため、確認用は出力先ごと分ける
exec env DATABASE_URL="$CHECK_DATABASE_URL" DEV_PORT="$CHECK_DEV_PORT" \
  NEXT_DIST_DIR=.next-check npm run dev
