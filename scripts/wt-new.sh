#!/bin/sh
# 並行作業用 worktree の一括セットアップ（T-06）。設計は docs/仕様/16_git運用と並行開発体制定義書.md §1.2・§3・§5。
#
# 使い方:
#   npm run wt:new -- <ブランチ名> [起点] [--allow-unpushed] [--no-fetch]
#
# <ブランチ名> は <タスクID>-<slug>（小文字・a-z 0-9 - のみ・49文字以内。例 fb-54-section-jump）。
# worktree は ../hitosuji-wt/<ブランチ名> に作られ、テストDBは db-test コンテナ内の
# hitosuji_test_<ブランチ名の - を _ に置換> を使う。起点はブランチ名で指定する（既定は main）。
#
# 起点は既定で origin を fetch してから検査し、未 push のコミットが乗っていれば中断する（T-46）。
# 逆に origin より遅れている場合は、古い起点から生えることを警告するだけで続行する。
#   --allow-unpushed  未 push の検査に引っかかっても続行する
#   --no-fetch        fetch を省く（origin の情報は手元にあるものを使う）
#
# dev サーバは worktree ごとに固有ポート（3001 から、他 worktree に割り当て済みのものと
# 使用中のものを避けて選ぶ）で起動できる。本体の .env.local をリンクし、開発DB（:5432）は
# 本体と共有する。起動はオーナーが自分のターミナルで行う（§3.2）。
set -eu

. "$(dirname "$0")/lib/db-test.sh"

name=""
base=""
allow_unpushed=0
do_fetch=1

usage() {
  echo "使い方: npm run wt:new -- <ブランチ名> [起点] [--allow-unpushed] [--no-fetch]" >&2
  echo "ブランチ名は小文字の a-z 0-9 - のみ・49文字以内（例: fb-54-section-jump）" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --allow-unpushed) allow_unpushed=1 ;;
    --no-fetch) do_fetch=0 ;;
    -*) usage ;;
    *)
      if [ -z "$name" ]; then
        name="$1"
      elif [ -z "$base" ]; then
        base="$1"
      else
        usage
      fi
      ;;
  esac
  shift
done
base="${base:-main}"

if [ -z "$name" ] || ! printf '%s' "$name" | grep -Eq '^[a-z0-9-]{1,49}$'; then
  usage
fi

# 本体ワークツリー専用（worktree の中から実行するとパスが二重にネストするため）
if [ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]; then
  echo "wt:new は本体ワークツリー（ヘッド側）から実行してください" >&2
  exit 1
fi

wt_dir="../hitosuji-wt/$name"
db_name="$(worktree_test_db_name "$name")"

# 起点の未 push 検査（T-46）。ローカルが origin より進んだまま worktree を作ると、その
# コミットが全ブランチの起点に入り、PR の差分（GitHub は origin と比較する）に写り込む。
# ローカルで main...branch を見ても差が出ないため、作る前に機械的に止める
if [ "$do_fetch" -eq 1 ] && ! git fetch --quiet origin; then
  echo "origin の fetch に失敗しました（オフライン等）" >&2
  echo "  手元にある origin の情報だけで検査してよければ --no-fetch を付けて再実行してください" >&2
  exit 1
fi
if ! git rev-parse --verify --quiet "$base" >/dev/null; then
  echo "起点 ${base} がローカルにありません" >&2
  echo "  名前を確かめるか、origin にしか無いなら先に取り出してください（git branch ${base} origin/${base}）" >&2
  exit 1
fi

behind_note=""
if ! git rev-parse --verify --quiet "refs/remotes/origin/$base" >/dev/null; then
  if [ "$allow_unpushed" -eq 0 ]; then
    echo "起点 ${base} に対応する origin/${base} がありません（未 push の起点かもしれません）" >&2
    echo "  先に push するか、意図した起点なら --allow-unpushed を付けて再実行してください" >&2
    exit 1
  fi
else
  if [ "$allow_unpushed" -eq 0 ]; then
    unpushed="$(git rev-list --count "origin/$base..$base")"
    if [ "$unpushed" -ne 0 ]; then
      echo "起点 ${base} に未 push のコミットが ${unpushed} 件あります（origin/${base}..${base}）:" >&2
      git log --oneline --max-count=5 "origin/$base..$base" | sed 's/^/    /' >&2
      echo "  このまま作ると全ブランチの PR 差分に写り込みます。先に push してください" >&2
      echo "  意図的なら --allow-unpushed を付けて再実行してください" >&2
      exit 1
    fi
  fi
  # 逆向き（起点が origin より遅れている）も見る。fetch が動かすのはリモート追跡 ref だけで
  # ローカルの起点は古いままなので、放っておくと古い commit から worktree が生える。ただし
  # 中断はしない——意図して古い起点から派生させることはあるので、気づける形にだけする
  behind="$(git rev-list --count "$base..origin/$base")"
  if [ "$behind" -ne 0 ]; then
    behind_note="起点 ${base} は origin/${base} より ${behind} 件遅れています（最新化するなら git pull --ff-only）"
    echo "警告: ${behind_note}" >&2
  fi
fi

# dev サーバ用ポートの割り当て（T-40）。3001 から、①既存 worktree の .env.worktree に
# 焼かれた割り当て済みポート ②いま使用中のポート の両方を避けて選ぶ。②だけを見ていた
# ときは、dev サーバを立てないまま worktree を続けて作ると全部が 3001 になった
# DEV_PORT の書式は scripts/dev.sh の読み出し側と合わせる
assigned_ports="$(sed -n 's/^DEV_PORT=\([0-9]\{1,\}\)$/\1/p' ../hitosuji-wt/*/.env.worktree 2>/dev/null || true)"
dev_port=3001
while [ "$dev_port" -lt 3100 ]; do
  if ! printf '%s\n' "$assigned_ports" | grep -qx "$dev_port" && ! lsof -ti:"$dev_port" >/dev/null 2>&1; then
    break
  fi
  dev_port=$((dev_port + 1))
done
if [ "$dev_port" -ge 3100 ]; then
  echo "3001〜3099 に空きポートがありません（npm run wt:rm で不要な worktree を片付けてください）" >&2
  exit 1
fi

# 重い処理（worktree 作成・npm ci）より先にテストDBを用意し、失敗を早く安く倒す
ensure_db_test_database "$db_name"

git worktree add "$wt_dir" -b "$name" "$base"

# vitest.config.ts が TEST_DATABASE_URL を、scripts/dev.sh が DEV_PORT を読む
# （どちらもシェルから渡された値が優先）。値は開発用の固定資格情報とポートのみ。
# npm ci より前に書くのは、上のポート選択がこのファイルを見るため——数分かかる
# npm ci を挟むと、その間に始まった 2本目が割り当て済みを見られず同じ番号を選ぶ
{
  printf 'TEST_DATABASE_URL=postgresql://hitosuji:hitosuji@localhost:5433/%s\n' "$db_name"
  printf 'DEV_PORT=%s\n' "$dev_port"
} > "$wt_dir/.env.worktree"

(cd "$wt_dir" && npm ci)

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
# npm ci の出力に流れて見落とされるため、遅れている旨はここでもう一度出す
if [ -n "$behind_note" ]; then
  echo "警告: ${behind_note}" >&2
fi
echo "worktree を作成しました: ${wt_dir}（ブランチ: ${name} / テストDB: ${db_name}）"
echo "dev サーバ: cd ${wt_dir} && npm run dev  →  http://localhost:${dev_port}"
echo "  開発DBは本体と共有します。同時に打刻・削除すると互いに干渉するので、データを触る確認は1つずつ行ってください"
