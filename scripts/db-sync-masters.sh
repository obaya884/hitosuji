#!/bin/sh
# 本番ダンプからマスタ・ルーチンだけを開発DBへ流し込む（要件定義書 §2.3 / FB-18）。
#
# 使い方:
#   npm run db:backup                                   # 先に本番のダンプを取る（README のバックアップ節）
#   npm run db:sync-masters -- backups/hitosuji_YYYYMMDD_HHMMSS.dump [対象DB名]
#
# 対象DBの既定は開発用の hitosuji。
# **タスク（ログ）は持ち込まない**。ルーチン展開で生成されるうえ、開発中に実データを増やす必要がないため。
# 対象DBの sections / modes / projects / routines と、それらを参照する tasks / routine_skips は
# 洗い替えになる（開発用のタスクは消える）。
set -eu

dump="${1:-}"
target="${2:-hitosuji}"

if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "ダンプファイルを指定してください: npm run db:sync-masters -- backups/<ファイル>" >&2
  exit 1
fi

printf '%s のマスタ・ルーチンを %s へ流し込みます。%s のタスクは削除されます。続けますか? [y/N] ' \
  "$dump" "$target" "$target"
read -r answer
case "$answer" in
  y | Y) ;;
  *)
    echo "中止しました"
    exit 1
    ;;
esac

# 参照している側から消す（FK 制約のため）。RESTART IDENTITY で採番も初期化する
docker compose exec -T db psql -U hitosuji -d "$target" -v ON_ERROR_STOP=1 \
  -c "TRUNCATE routine_skips, tasks, routines, projects, modes, sections RESTART IDENTITY CASCADE"

# --data-only: スキーマはマイグレーションで作った側を正とする（ダンプ側の定義で上書きしない）
# --no-owner / --no-privileges: Neon のロール（neondb_owner）はローカルに存在しない
docker compose exec -T db pg_restore \
  --data-only --no-owner --no-privileges \
  -t sections -t modes -t projects -t routines \
  -U hitosuji -d "$target" < "$dump"

# --data-only の部分リストアではシーケンスが進まないため、最大IDに合わせ直す
# （合わせないと次の INSERT が既存IDと衝突する）
for table in sections modes projects routines; do
  docker compose exec -T db psql -U hitosuji -d "$target" -v ON_ERROR_STOP=1 -c \
    "SELECT setval(pg_get_serial_sequence('$table', 'id'), COALESCE((SELECT MAX(id) FROM $table), 1))"
done

echo "${dump} のマスタ・ルーチンを ${target} へ流し込みました"
docker compose exec -T db psql -U hitosuji -d "$target" -c \
  "SELECT 'sections' AS table, count(*) FROM sections
   UNION ALL SELECT 'modes', count(*) FROM modes
   UNION ALL SELECT 'projects', count(*) FROM projects
   UNION ALL SELECT 'routines', count(*) FROM routines"
