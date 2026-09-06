#!/bin/sh
# プロセス間の排他ロックの共通処理（T-65）。
# scripts/with-test-db-lock.sh（テストDBの排他・T-65）と scripts/test-coverage.sh
# （カバレッジ出力先の排他・T-58）が読み込む。
#
# 実行するのではなく `.` で読み込んで使う。呼び出し側が set -eu を敷いている前提。
# sh に `local` が無く関数内の変数は読み込んだスクリプトのグローバルを汚すため、
# 関数内でだけ使う変数には `_` を前置して呼び出し側と分ける。
#
# ただし acquire_lock は `... || rc=$?` の左辺で呼ばれるため、POSIX の規定により
# **関数の実行中は errexit が効かない**。失敗はすべて自分で検査すること。
#
# ロックの実体はシンボリックリンクで、リンク先が保持者の PID。作成と PID の記録が
# 1操作で済むので「作った直後・PID を書く前」に別プロセスが覗く隙が無い。

# ロックを取る。戻り値は 0=取れた / 1=時間内に取れなかった / 2=呼び出し方の誤り。
#   acquire_lock <ロックのパス> <待つ秒数（0 なら待たずに諦める）> <表示名>
# 取れなかったときの保持者 PID は lock_holder_pid に入る（読めなければ空）。
# 取れなかったときのメッセージは用途ごとに違うので、呼び出し側が出す——**1 と 2 は
# 出し分けること**。競合していないのに「残骸を消せ」と案内すると、ロックを手で消す
# 誤操作を誘い、その先で本物の競合を起こす。
#
# 待つ秒数を渡した以上、**どの経路でも有限時間で戻る**のが本関数の契約（無音で CPU を
# 回し続ける経路を作らない）。ロックを作れない環境（置き場の権限・symlink 非対応の
# ファイルシステム）は待っても解消しないので、待たずに 2 で戻る。
acquire_lock() {
  _lock="$1"
  _timeout="$2"
  _label="$3"
  _waited=0
  _notified=0
  lock_holder_pid=""

  case "$_timeout" in
    '' | *[!0-9]*)
      echo "acquire_lock: 待つ秒数は 0 以上の整数で指定してください（受け取った値: ${_timeout}）" >&2
      return 2
      ;;
  esac

  _dir=$(dirname "$_lock")
  if ! mkdir -p "$_dir"; then
    echo "acquire_lock: ロックを置く ${_dir} を作れませんでした" >&2
    return 2
  fi

  while ! ln -s "$$" "$_lock" 2>/dev/null; do
    if [ ! -e "$_lock" ] && [ ! -L "$_lock" ]; then
      # ln が失敗したのに実体が無い。直前に解放された（もう一度試せば取れる）か、
      # そもそも作れない（置き場の権限・symlink 非対応）かのどちらか。区別は
      # 「もう一度 ln して、なお実体が無いか」で付く。後者を競合として待たせると、
      # 解消しない原因で 600 秒待たせたうえ「残骸を消せ」と誤った案内をしてしまう
      if ln -s "$$" "$_lock" 2>/dev/null; then
        break
      fi
      if [ ! -e "$_lock" ] && [ ! -L "$_lock" ]; then
        echo "acquire_lock: ロック ${_lock} を作れません（置き場の権限か、symlink 非対応のファイルシステム）" >&2
        return 2
      fi
    fi

    lock_holder_pid="$(readlink "$_lock" 2>/dev/null || true)"

    # kill -0 の失敗は「不在」だけでなく「権限が無い（他ユーザの PID）」でも起きる。
    # 単独オーナーの手元運用では前者しか起きないため残骸と見なしてよい
    if [ -z "$lock_holder_pid" ] || ! kill -0 "$lock_holder_pid" 2>/dev/null; then
      # 前回が異常終了して残ったロック（または symlink ですらない残骸）。素の rm で消すと
      # 「消した直後に別の待ち手が取得した正当なロック」まで巻き添えにしうるので、mv で
      # 自分の名前へ引き取ってから消す——同時に残骸へ気付いた側は mv に失敗し、次の周回で
      # 生きた保持者を見て正しく待ちに回る
      _stale="${_lock}.stale.$$"
      if mv "$_lock" "$_stale" 2>/dev/null; then
        rm -f "$_stale"
        continue # 引き取れた＝前進したので、待たずにすぐ ln を試す
      fi
      # mv も失敗＝別の待ち手に先を越されたか、置き場が読み取り専用。どちらも
      # 下の待ちに合流させ、タイムアウトで必ず戻す
    fi

    if [ "$_waited" -ge "$_timeout" ]; then
      return 1
    fi
    if [ "$_notified" -eq 0 ]; then
      echo "${_label}を別のプロセス（PID ${lock_holder_pid:-不明}）が使用中です。空くまで待ちます…" >&2
      _notified=1
    fi
    sleep 1
    _waited=$((_waited + 1))
  done

  if [ "$_notified" -eq 1 ]; then
    echo "${_label}が空きました（${_waited} 秒待機）。実行します" >&2
  fi
  lock_holder_pid=""
  return 0
}

# 自分のロックだけを消す（奪われた場合や、実行中に手で消された後に他が取得した場合に、
# 他人のロックを巻き添えにしない）。呼び出し側の EXIT トラップから呼ぶ
release_lock() {
  if [ "$(readlink "$1" 2>/dev/null || true)" = "$$" ]; then
    rm -f "$1"
  fi
}
