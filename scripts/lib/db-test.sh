#!/bin/sh
# db-test コンテナ（docker-compose.yml の :5433・tmpfs）を使うスクリプトの共通処理（T-84）。
# scripts/dev-check.sh（確認専用DB hitosuji_check）と scripts/wt-new.sh（worktree 専用
# テストDB hitosuji_test_<ブランチ名>）が読み込む。
#
# 実行するのではなく `.` で読み込んで使う。呼び出し側が set -eu を敷いている前提。
# sh に `local` が無く関数内の変数は読み込んだスクリプトのグローバルを汚すため、
# 関数内でだけ使う変数には `_` を前置して呼び出し側と分ける。

# worktree 専用テストDBの名前をブランチ名から導く（`-` は識別子に使えないので `_` へ）。
# wt-new.sh が作り wt-rm.sh が消す——**両者がズレると「作ったDBと消すDBが違う」形で
# 静かに壊れる**ので、規則はここ1か所に置く
worktree_test_db_name() {
  printf 'hitosuji_test_%s\n' "$(printf '%s' "$1" | tr '-' '_')"
}

# db-test を起動し、指定のDBが無ければ作る。
# 起動を待ちきれなければ理由を出して 1 を返す（呼び出し側の set -e がそこで止まる）
ensure_db_test_database() {
  _db_name="$1"
  # pg_isready を1秒間隔で試す回数。db-test は tmpfs なので通常は数秒で上がる
  _retries=30

  docker compose up -d db-test

  _i=0
  until docker compose exec -T db-test pg_isready -U hitosuji -q 2>/dev/null; do
    _i=$((_i + 1))
    if [ "$_i" -ge "$_retries" ]; then
      echo "db-test の起動を待ちきれませんでした（docker compose logs db-test を確認してください）" >&2
      return 1
    fi
    sleep 1
  done

  # tmpfs なので docker compose down のたびに消える。無ければ作る
  if ! docker compose exec -T db-test psql -U hitosuji -d hitosuji_test -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$_db_name'" | grep -q 1; then
    docker compose exec -T db-test psql -U hitosuji -d hitosuji_test -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE $_db_name"
  fi
}
