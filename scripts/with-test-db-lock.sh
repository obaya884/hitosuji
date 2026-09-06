#!/bin/sh
# テストDBを使う実行のプロセス間排他ラッパ（T-65）。統合テストの前提は
# docs/仕様/17_テスト戦略定義書.md §5。
#
# 使い方:
#   sh scripts/with-test-db-lock.sh <コマンド> [引数...]
# package.json では npm test / npm run test:int / npm run test:coverage が経由する。
# **入れ子で呼ばない**——この3つは既に経由済みで、ラッパの中から呼ぶと自分の待ちに嵌る。
#
# 統合テストはテストごとに全テーブルを TRUNCATE するため、同じテストDBへ2本が重なると
# 互いのデータを消し合い「偽の赤」になる（単独で再実行すると緑なので原因に辿り着けない）。
# 1回の vitest 実行の中は fileParallelism: false で直列だが、別プロセスは防げない。
#
# 取れなければ落とすのではなく**空くまで待つ**。並列起動したレビュアーが順番待ちで
# 全員正しい結果を得るのが望ましい形で、明示的な赤にしても結局は手で再実行するだけになる。
# 待ち時間の上限は TEST_DB_LOCK_TIMEOUT 秒（既定 600。0 なら待たずに落とす）。
#
# ロックはワークツリー単位に置く。テストDBは worktree ごとに分かれている（T-06。
# wt-new.sh が hitosuji_test_<ブランチ名> を作り .env.worktree に書く）ので、
# ワークツリーが違えば叩くDBも違い、待たせる理由が無い。逆にシェルで
# TEST_DATABASE_URL を別ワークツリーのDBへ向けた場合はこの前提から外れる。
#
# 範囲はコマンド1本まるごと。npm test は DB を触らない unit・component も巻き込んで
# 待つが、統合の段だけを正確に囲むには vitest の globalSetup（src/ 配下）へ入れる必要が
# あり、シェル側なら `npm run test:coverage` のような別経路も同じ1か所で守れる。
#
# 対象外: npm run test:watch。監視は何時間も動き続けるためロックを持たせると他が
# 一切走らなくなる。統合テストを含む監視を回している間は他の実行を控えること。
#
# 既知の穴: ロックが記録するのは**このラッパの PID** で、実際にDBを触る vitest の PID
# ではない。ラッパだけに SIGKILL を送ると子は孤児として生き残り、ロックは死んだ PID を
# 指したまま残る → 次の実行が残骸と見て奪う → 生きた vitest の下で TRUNCATE が走る。
# Ctrl+C も `kill <PID>`（TERM）も安全（前者はプロセスグループ全体へ届き、後者は sh が
# 前景コマンドの完了までトラップを遅らせるので子が終わるまで解放されない）ので、
# **ラッパ単体を kill -9 しない**ことだけが利用側の約束。
set -eu

if [ "$#" -eq 0 ]; then
  echo "使い方: sh scripts/with-test-db-lock.sh <コマンド> [引数...]" >&2
  exit 2
fi

# 読み込みは cd の前に済ませる（$0 が相対パスのとき、移動した後では解決できなくなる）
. "$(dirname "$0")/lib/lock.sh"

# 素の `cd "$(git rev-parse --show-toplevel)"` はリポジトリ外で空文字列の cd になり、
# 失敗扱いにならないままカレントディレクトリで走り出す（読めない理由で落ちて原因が分かりにくい）
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "hitosuji リポジトリの中で実行してください" >&2
  exit 1
}
cd "$repo_root"

lock="node_modules/.cache/hitosuji-test-db.lock"
timeout="${TEST_DB_LOCK_TIMEOUT:-600}"

rc=0
acquire_lock "$lock" "$timeout" "テストDB" || rc=$?
# 2 は呼び出し方や環境の誤りで、競合ではない（出し分ける理由は lock.sh の契約）
if [ "$rc" -eq 2 ]; then
  exit 2
fi
if [ "$rc" -ne 0 ]; then
  echo "テストDBのロックを ${timeout} 秒待っても取得できませんでした（保持者 PID ${lock_holder_pid:-不明}）" >&2
  echo "  統合テストは同じテストDBを共有するため、同時に走らせると互いのデータを TRUNCATE で消し合います" >&2
  echo "  待ち時間は TEST_DB_LOCK_TIMEOUT=<秒> で変えられます（0 なら待たずに落とす）" >&2
  echo "  保持者がテスト実行でないなら残骸なので消してください: rm -f ${lock}" >&2
  exit 1
fi
trap 'release_lock "$lock"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

status=0
"$@" || status=$?
exit "$status"
