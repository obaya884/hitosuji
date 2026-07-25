#!/bin/sh
# 並行作業用 worktree の後片付け（T-06）。設計は docs/仕様/16_git運用と並行開発体制定義書.md §1.2・§3・§5。
#
# 使い方:
#   npm run wt:rm -- <ブランチ名>
#
# worktree（../hitosuji-wt/<ブランチ名>）・ローカルブランチ・worktree 専用テストDBを削除する。
# 未コミットの変更が残っている場合は中断する（--force は設けない。防護は git の安全装置に寄せる）。
set -eu

name="${1:-}"

if [ -z "$name" ] || ! printf '%s' "$name" | grep -Eq '^[a-z0-9-]{1,49}$'; then
  echo "使い方: npm run wt:rm -- <ブランチ名>" >&2
  echo "ブランチ名は小文字の a-z 0-9 - のみ・49文字以内（例: fb-54-section-jump）" >&2
  exit 1
fi

# 本体ワークツリー専用（worktree の中から実行するとパスの前提が崩れるため）
if [ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]; then
  echo "wt:rm は本体ワークツリー（ヘッド側）から実行してください" >&2
  exit 1
fi

wt_dir="../hitosuji-wt/$name"
db_name="hitosuji_test_$(printf '%s' "$name" | tr '-' '_')"

if [ ! -d "$wt_dir" ]; then
  echo "$wt_dir がありません" >&2
  exit 1
fi

# 対話実行のときだけ確認する（AI 実行時は permission の ask が確認を兼ねる）
if [ -t 0 ]; then
  printf "%s（ブランチ %s・テストDB %s）を削除します。よろしいですか？ [y/N] " "$wt_dir" "$name" "$db_name"
  read -r answer
  case "$answer" in
    y|Y) ;;
    *) echo "中断しました"; exit 1 ;;
  esac
fi

if [ -n "$(git -C "$wt_dir" status --porcelain)" ]; then
  echo "未コミットの変更が残っています。コミットまたは破棄してから再実行してください" >&2
  exit 1
fi

# DB は worktree より先に消す（後段が失敗しても worktree が残り、再実行で復旧できる順序）。
# WITH (FORCE) で残存接続ごと落とす（worktree 専用DBのため安全）
if [ -n "$(docker compose ps -q --status running db-test)" ]; then
  docker compose exec -T db-test psql -U hitosuji -d hitosuji_test -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $db_name WITH (FORCE)"
else
  echo "db-test が停止中のためテストDBの削除をスキップしました（tmpfs のためコンテナ再作成で消えます）"
fi

git worktree remove "$wt_dir"

# squash マージ運用では -d はマージを検出できず失敗する（git 運用ルール §1.2）。その場合はヒントを出して残す
git branch -d "$name" \
  || echo "ブランチ $name は未マージ扱い（squash マージ後もこうなる）のため残しました。マージ済みを確認のうえ git branch -D $name で削除してください"

rmdir ../hitosuji-wt 2>/dev/null || true  # 最後の worktree を消したら空の親ディレクトリも残さない
echo "worktree を削除しました: $wt_dir"
