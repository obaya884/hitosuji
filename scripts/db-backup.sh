#!/bin/sh
# DBのバックアップ（N-06）。DATABASE_URL が指すDBを pg_dump のカスタム形式で backups/ へ保存する。
#
# 使い方（本番を取る場合。接続文字列は引数に書かない ← 履歴に平文で残るため）:
#   set -a; . ./.env.migrate; set +a; npm run db:backup
#
# ローカルに pg_dump を入れずに済ませるため、クライアントはコンテナのものを使う。
# 本番 Neon が PostgreSQL 17 なので、イメージも 17 に合わせる（サーバより古いと dump できない）。
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL が未設定です。 set -a; . ./.env.migrate; set +a を先に実行してください" >&2
  exit 1
fi

mkdir -p backups
name="hitosuji_$(date +%Y%m%d_%H%M%S).dump"

# 接続文字列はコンテナ内で展開する（プロセス引数に平文で現れないようにするため）
docker run --rm \
  -e DATABASE_URL \
  -e DUMP_NAME="$name" \
  -v "$PWD/backups:/backups" \
  postgres:17-alpine \
  sh -c 'pg_dump "$DATABASE_URL" -Fc -f "/backups/$DUMP_NAME"'

echo "backups/$name を作成しました（$(du -h "backups/$name" | cut -f1)）"
