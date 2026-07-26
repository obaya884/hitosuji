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
set -eu

# ロックはワークツリー単位（worktree ごとに coverage/ も node_modules/ も別）
cd "$(git rev-parse --show-toplevel)"

lock="node_modules/.cache/hitosuji-coverage.lock"
mkdir -p "$(dirname "$lock")"

# ロックの実体はシンボリックリンクで、リンク先が保持者の PID。作成と PID の記録が
# 1操作で済むので「作った直後・PID を書く前」に別プロセスが覗く隙が無い
busy() {
  holder=""
  if [ -n "${1:-}" ]; then
    holder="（PID ${1}）"
  fi
  echo "別のカバレッジ計測${holder}が実行中です。終わってから再実行してください" >&2
  echo "  同時に走らせると両方の結果が壊れます（coverage/ を共有するため）" >&2
  echo "  実行中でないのに出る場合は残骸なので消してください: rm -f ${lock}" >&2
  exit 1
}

if ! ln -s "$$" "$lock" 2>/dev/null; then
  pid="$(readlink "$lock" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    busy "$pid"
  fi
  # 前回が異常終了して残ったロック。奪い返すが、rm と ln の2操作なので同時に奪い合うと
  # 両方が成功しうる（後から rm した側のリンクが残り、先の側は自分が持っていると誤解する）。
  # 少し置いてから自分のリンクかを確かめ、違えば取得できなかった側として降りる
  rm -f "$lock"
  ln -s "$$" "$lock" 2>/dev/null || busy ""
  sleep 1
  [ "$(readlink "$lock" 2>/dev/null || true)" = "$$" ] || busy ""
fi
# 自分のロックだけを消す（奪われた場合や、実行中に手で消された後に他が取得した場合に、
# 他人のロックを巻き添えにしない）
trap 'if [ "$(readlink "$lock" 2>/dev/null || true)" = "$$" ]; then rm -f "$lock"; fi' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

status=0
npx vitest run --coverage --no-file-parallelism "$@" || status=$?
exit "$status"
