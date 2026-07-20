#!/bin/sh
# バックアップからの復元（N-06）。ローカルの db コンテナに復元先DBを作り直して流し込む。
#
# 使い方:
#   npm run db:restore -- backups/hitosuji_YYYYMMDD_HHMMSS.dump [復元先DB名]
#
# 復元先の既定は hitosuji_restore（検証用）。開発用の hitosuji を指定すると開発データを失うため、
# 明示的に渡さない限り触らない。
set -eu

dump="${1:-}"
target="${2:-hitosuji_restore}"

if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "ダンプファイルを指定してください: npm run db:restore -- backups/<ファイル>" >&2
  exit 1
fi

echo "復元先: ${target}（既存なら作り直します）"
docker compose exec -T db psql -U hitosuji -d postgres \
  -c "DROP DATABASE IF EXISTS $target" \
  -c "CREATE DATABASE $target"

# --no-owner / --no-privileges: Neon のロール（neondb_owner）はローカルに存在しないため、
# 所有者・権限の指定を落として現在のロールで復元する
docker compose exec -T db pg_restore \
  --no-owner --no-privileges \
  -U hitosuji -d "$target" < "$dump"

echo "${dump} を ${target} へ復元しました"
echo "接続先: postgresql://hitosuji:hitosuji@localhost:5432/${target}"
