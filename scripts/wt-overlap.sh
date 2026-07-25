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
# 終了コード: 0=重なりなし / 1=重なりあり / 2=判定できなかった（引数不正・ブランチ不在・git の異常）。
# 意味的な衝突（別ファイルだが前提が壊れる）は検出できない。分割の妥当性そのものは人が見る。
set -eu
set -f  # ブランチ名の語分割でパス名グロブが働かないようにする（a* が手元のファイルに化けるのを防ぐ）

# 日本語メッセージ中の変数は ${name} で囲む。bash 3.2 では変数の直後に非ASCII（全角括弧など）が
# 続くとそこまでが変数名と読まれるため（仕様/16 の決定。2026-07-25 に実測）

cd "$(git rev-parse --show-toplevel)"

usage() {
  sed -n '/^# 使い方:/,/^set /p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
}

# 判定できなかった側の終了。「重なりあり」（1）と取り違えられないよう 2 を返す
die() {
  echo "$1" >&2
  exit 2
}

base="main"
branches=""
explicit=0

while [ $# -gt 0 ]; do
  case "$1" in
    --base)
      shift
      [ $# -gt 0 ] || die "--base には起点のブランチ名が要ります"
      base="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "不明なオプション: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      branches="$branches $1"
      explicit=1
      ;;
  esac
  shift
done

git rev-parse --verify --quiet "$base" >/dev/null || die "起点 $base が見つかりません"
base_sha=$(git rev-parse "$base")

# 引数がなければ worktree で稼働中のブランチを対象にする（並行作業は1タスク＝1 worktree のため。§2）
if [ "$explicit" -eq 0 ]; then
  branches=$(git worktree list --porcelain \
    | awk '/^branch /{ sub("refs/heads/", "", $2); print $2 }')
fi

targets=""
for b in $branches; do
  git rev-parse --verify --quiet "$b" >/dev/null || die "ブランチ $b が見つかりません"

  # 同じブランチが2回入ると、総当たりがそのペアを飛ばして「重なりなし」＝最も危険な側に倒れる
  case " $targets " in
    *" $b "*)
      echo "$b は重複して指定されたため1本として扱います"
      continue
      ;;
  esac

  # 起点そのもの（本体ワークツリーの main）は比較対象にならない
  if [ "$(git rev-parse "$b")" = "$base_sha" ]; then
    if [ "$explicit" -eq 1 ]; then
      echo "$b は起点 ${base} と同じコミットのため比較から外します"
    fi
    continue
  fi

  targets="$targets $b"
done

set -- $targets
count=$#

if [ "$count" -lt 2 ]; then
  if [ "$explicit" -eq 1 ]; then
    echo "比較できるブランチが $count 本しかありません（起点: ${base}）"
  else
    echo "稼働中の worktree に比較できるブランチが $count 本しかありません（起点: ${base}）。引数でブランチを直接指定することもできます"
  fi
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
trap 'rm -rf "$work"; exit 130' INT TERM

echo "起点: ${base}（$count 本を比較）"
echo

i=0
for b in "$@"; do
  i=$((i + 1))
  # 一覧はブランチ名でなく連番のファイルに持つ（規約外の名前＝スラッシュを含む等でも壊れないため）。
  # core.quotePath=false は日本語パスが8進エスケープで出るのを防ぐ（共有 docs は最も重なりやすい）
  git -c core.quotePath=false diff --name-only "${base}...${b}" | LC_ALL=C sort > "$work/$i"
  echo "  $b — $(grep -c . "$work/$i" || true) ファイル"
done
echo

overlapped=0
ai=0
for a in "$@"; do
  ai=$((ai + 1))
  bi=0
  for b in "$@"; do
    bi=$((bi + 1))
    [ "$bi" -gt "$ai" ] || continue  # 同じペアを2回見ない（名前でなく位置で判定する）

    shared=$(LC_ALL=C comm -12 "$work/$ai" "$work/$bi")
    if [ -n "$shared" ]; then
      overlapped=1
      echo "重なりあり: $a × $b"
      printf '%s\n' "$shared" | sed 's/^/    /'
      continue
    fi

    # merge-tree の終了コードは 0=衝突なし / 1=衝突 / 2以上=異常（--write-tree 非対応の git 2.38 未満を含む）。
    # 一律に「衝突」と読むと、判定できていないものを衝突として報告してしまう
    merge_status=0
    git merge-tree --write-tree "$a" "$b" >/dev/null 2>&1 || merge_status=$?
    case "$merge_status" in
      0)
        echo "重なりなし: $a × ${b}（中間 rebase を省略してよい）"
        ;;
      1)
        # 変更ファイルが交わらないのに衝突するのは、ディレクトリとファイルの取り違えやリネームが絡むとき
        overlapped=1
        echo "重なりなし・ただしマージが衝突: $a × ${b}（ディレクトリとファイルの取り違え・リネームの可能性。rebase する）"
        ;;
      *)
        die "git merge-tree が失敗しました（$a × $b・終了コード ${merge_status}）。git 2.38 以降が要ります"
        ;;
    esac
  done
done

echo
if [ "$overlapped" -eq 1 ]; then
  echo "重なるペアがあります。直列化するか、マージ後に残ブランチを rebase してください（§1.3）"
  exit 1
fi

echo "すべてのペアで重なりなし。マージ順は任意で、中間 rebase を省略できます（§1.3）"
