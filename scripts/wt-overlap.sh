#!/bin/sh
# 並行タスク間のファイル衝突を機械判定する（T-35）。設計は docs/仕様/16_git運用と並行開発体制定義書.md §1.3・§5。
#
# 使い方:
#   npm run wt:overlap                      # 稼働中の worktree のブランチ同士を総当たり
#   npm run wt:overlap -- <A> <B> [<C>...]  # 指定したブランチを総当たり
#   npm run wt:overlap -- --base <ref> ...  # 比較の起点（既定 main）
#
# 各ブランチの変更ファイル集合（git diff --name-only <base>...<branch>）の積集合を出す。
# 空なら「そのペアは中間 rebase を省略してよい」（§1.3）、空でなければ重なるファイルを列挙する。
# 積集合が空のペアは git merge-tree でもテキスト衝突がないことを確かめる（§1.3 が両方を求めるため）。
#
# 重なりが1組でもあれば終了コード 1 を返す（判定を他のスクリプトから使えるようにするため）。
# 意味的な衝突（別ファイルだが前提が壊れる）は検出できない。分割の妥当性そのものは人が見る。
set -eu

cd "$(git rev-parse --show-toplevel)"

base="main"
branches=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base)
      shift
      [ $# -gt 0 ] || { echo "--base には起点のブランチ名が要ります" >&2; exit 1; }
      base="$1"
      ;;
    -h|--help)
      sed -n '3,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "不明なオプション: $1" >&2
      exit 1
      ;;
    *)
      branches="$branches $1"
      ;;
  esac
  shift
done

git rev-parse --verify --quiet "$base" >/dev/null || {
  echo "起点 $base が見つかりません" >&2
  exit 1
}

# 引数がなければ worktree で稼働中のブランチを対象にする（並行作業は1タスク＝1 worktree のため。§2）
if [ -z "$branches" ]; then
  branches=$(git worktree list --porcelain \
    | awk '/^branch /{ sub("refs/heads/", "", $2); print $2 }')
fi

# 起点そのもの（本体ワークツリーの main）は比較対象から外す
targets=""
for b in $branches; do
  [ "$(git rev-parse "$b" 2>/dev/null || echo "")" = "$(git rev-parse "$base")" ] && continue
  git rev-parse --verify --quiet "$b" >/dev/null || { echo "ブランチ $b が見つかりません" >&2; exit 1; }
  targets="$targets $b"
done

count=$(printf '%s\n' $targets | grep -c . || true)
if [ "$count" -lt 2 ]; then
  echo "比較できるブランチが $count 本しかありません（起点: ${base}）。並行作業がないか、引数でブランチを指定してください"
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

echo "起点: ${base}（$count 本を比較）"
echo
for b in $targets; do
  # ${base}... と括るのは、$base... だと変数名が "base..." と読まれるため
  git diff --name-only "${base}...${b}" | sort > "$work/$b"
  echo "  $b — $(grep -c . "$work/$b" || true) ファイル"
done
echo

overlapped=0
for a in $targets; do
  for b in $targets; do
    # 同じペアを2回見ないよう、辞書順で片側だけ処理する
    [ "$a" \< "$b" ] || continue

    shared=$(comm -12 "$work/$a" "$work/$b")
    if [ -n "$shared" ]; then
      overlapped=1
      echo "重なりあり: $a × $b"
      printf '%s\n' "$shared" | sed 's/^/    /'
      continue
    fi

    if git merge-tree --write-tree "$a" "$b" >/dev/null 2>&1; then
      echo "重なりなし: $a × ${b}（中間 rebase を省略してよい）"
    else
      # 変更ファイルが交わらないのにマージが衝突するのは、リネームや削除が絡むとき
      overlapped=1
      echo "重なりなし・ただしマージが衝突: $a × ${b}（リネーム・削除が絡む可能性。rebase する）"
    fi
  done
done

echo
if [ "$overlapped" -eq 1 ]; then
  echo "重なるペアがあります。直列化するか、マージ後に残ブランチを rebase してください（§1.3）"
  exit 1
fi

echo "すべてのペアで重なりなし。マージ順は任意で、中間 rebase を省略できます（§1.3）"
