#!/bin/sh
# リポジトリのルートへ移動する共通処理（T-142）。
# リポジトリ直下からの相対パスで動くスクリプト（coverage-summary.sh・diff-breakdown.sh・
# docs-check.sh・ledger-move.sh・test-coverage.sh・with-test-db-lock.sh・wt-overlap.sh）が読み込む。
#
# 実行するのではなく `.` で読み込んで使う。呼び出し側が set -eu を敷いている前提。
# sh に `local` が無いため、関数内でだけ使う変数には `_` を前置して呼び出し側と分ける。
# 読み込みは cd の前に済ませること——`$(dirname "$0")` は $0 が相対パスのとき、
# 移動した後では解決できなくなる。

# リポジトリのルートへ cd する。リポジトリの外なら理由を出して終了する（戻らない）。
# 素の `cd "$(git rev-parse --show-toplevel)"` はリポジトリ外で空文字列の cd になり、
# 失敗扱いにならないままカレントディレクトリで走り出す（読めない理由で落ちて原因が分かりにくい）
cd_repo_root() {
  _repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "hitosuji リポジトリの中で実行してください" >&2
    exit 1
  }
  cd "$_repo_root"
}
