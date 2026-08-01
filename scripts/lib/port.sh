#!/bin/sh
# dev サーバのポートの使用状況を伝える共通処理（T-84）。
# scripts/dev.sh（割り当てポートが埋まっている警告）と scripts/dev-check.sh（確認環境の
# 二重起動の中断）が読み込む。どちらも「誰が掴んでいるか」を見せて原因に辿り着かせる。
#
# 実行するのではなく `.` で読み込んで使う。sh に `local` が無く関数内の変数は読み込んだ
# スクリプトのグローバルを汚すため、関数内でだけ使う変数には `_` を前置して呼び出し側と分ける。

# 指定ポートを掴んでいるプロセスを stderr に並べる。
# 第2引数は行頭のインデントで、呼び出し側の直前の echo と深さを揃えるため必須にしている
print_port_holders() {
  _port="$1"
  _indent="$2"
  lsof -ti:"$_port" | while read -r _pid; do
    echo "${_indent}PID ${_pid}: $(ps -o command= -p "$_pid" 2>/dev/null | cut -c1-60)" >&2
  done
}
