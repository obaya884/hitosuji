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

# node_modules・.next を先に落とす（T-32）。git worktree remove の再帰削除は
# 「削除中に何かがファイルを保持・再作成している」と Directory not empty で落ちる。
# 実測で7本中4本が失敗し、いずれもエディタが当該 worktree を開いたままだった。
# この2つはファイル数の大半を占め、かつ gitignore 対象なので上の clean 判定に影響しない。
# $name は先頭の正規表現で [a-z0-9-] に限定済みのため、パスがディレクトリを脱出することはない
rm -rf "$wt_dir/node_modules" "$wt_dir/.next"

# .env.local は本体へのシンボリックリンク（T-34）。-f はリンク自体を消すだけで実体には触れないが、
# 万一実体が置かれていた場合に消さないよう、リンクであることを確かめてから外す
if [ -L "$wt_dir/.env.local" ]; then
  rm -f "$wt_dir/.env.local"
fi

if ! git worktree remove "$wt_dir" 2>/dev/null; then
  # 外部要因（TS server 等）が掴んでいる間だけ失敗することがあるため一度待って再試行する
  sleep 2
  if ! git worktree remove "$wt_dir" 2>/dev/null; then
    # 最後の砦: 登録を解除してディレクトリを明示削除する。dirty の防護は上の clean 判定が
    # 既に果たしているので、ここで git の安全装置を迂回しても防護は落ちない
    echo "git worktree remove が失敗したため、登録解除＋明示削除にフォールバックします" >&2
    rm -rf "$wt_dir"
    git worktree prune
  fi
fi

# squash マージ運用では -d はマージを検出できず失敗する（git 運用ルール §1.2）。
# リモートブランチが消えていれば GitHub がマージ時に自動削除した証拠なので -D で消す
if ! git branch -d "$name" 2>/dev/null; then
  if git ls-remote --exit-code --heads origin "$name" >/dev/null 2>&1; then
    echo "ブランチ $name はリモートに残っています（未マージの可能性）。確認のうえ git branch -D $name で削除してください" >&2
  else
    git branch -D "$name"
    echo "ブランチ $name を削除しました（リモートが削除済み＝squash マージ済みと判定）"
  fi
fi

rmdir ../hitosuji-wt 2>/dev/null || true  # 最後の worktree を消したら空の親ディレクトリも残さない
echo "worktree を削除しました: $wt_dir"
