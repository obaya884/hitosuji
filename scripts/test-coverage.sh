#!/bin/sh
# カバレッジ計測の実行ラッパ（T-58）。設計は docs/仕様/17_テスト戦略定義書.md §7。
#
# 使い方:
#   npm run test:coverage           # 全プロジェクト
#   npm run test:coverage -- <引数>  # vitest へそのまま渡す（例: --project unit）
#
# 同一ワークツリーでカバレッジ計測を二重に走らせるのを止めるのが唯一の役目。vitest は
# 起動時に coverage/ を消して coverage/.tmp を作り直す（coverage.clean の既定）ため、
# 2本目が始まると1本目の .tmp ごと消え、1本目が
#   Something removed the coverage directory "coverage/.tmp" ...（または生の ENOENT）
# で異常終了する。メインセッションと verifier のように、別々の主体が同時に叩くと起きる。
# ロックは coverage/ の外（node_modules/.cache）に置く——中に置くと vitest 自身に消される。
#
# テストDB側の排他は別のロック（with-test-db-lock.sh・T-65）が持つ。カバレッジ計測は
# 統合テストも走らせるため両方が要る——こちらは待たずに落とし（結果が壊れるだけで
# 待つ意味が無い）、あちらは空くまで待つ。
set -eu

# 読み込みは cd の前に済ませる（$0 が相対パスのとき、移動した後では解決できなくなる）
. "$(dirname "$0")/lib/lock.sh"

# ロックはワークツリー単位（worktree ごとに coverage/ も node_modules/ も別）
# 素の `cd "$(git rev-parse --show-toplevel)"` はリポジトリ外で空文字列の cd になり、
# 失敗扱いにならないままカレントディレクトリで走り出す（読めない理由で落ちて原因が分かりにくい）
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "hitosuji リポジトリの中で実行してください" >&2
  exit 1
}
cd "$repo_root"

lock="node_modules/.cache/hitosuji-coverage.lock"

# 待たない（第2引数 0）。同時に走らせると出力が壊れるだけなので、順番待ちさせるより
# 「いま二重に走っている」を即伝えたほうが早い
rc=0
acquire_lock "$lock" 0 "カバレッジ計測" || rc=$?
# 2 は呼び出し方や環境の誤りで、競合ではない（出し分ける理由は lock.sh の契約）
if [ "$rc" -eq 2 ]; then
  exit 2
fi
if [ "$rc" -ne 0 ]; then
  echo "別のカバレッジ計測（PID ${lock_holder_pid:-不明}）が実行中です。終わってから再実行してください" >&2
  echo "  同時に走らせると両方の結果が壊れます（coverage/ を共有するため）" >&2
  echo "  実行中でないのに出る場合は残骸なので消してください: rm -f ${lock}" >&2
  exit 1
fi
trap 'release_lock "$lock"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

status=0
sh scripts/with-test-db-lock.sh npx vitest run --coverage --no-file-parallelism "$@" || status=$?
exit "$status"
