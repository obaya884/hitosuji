#!/bin/sh
# 台帳の表構造を検査する（T-36）。設計は docs/案件/23_技術改善バックログ.md T-36。
#
# 使い方:
#   npm run ledger:check
#
# 検査するのは「AI が長いテーブル行を手編集して壊した実績のある3種」だけ:
#   ①テーブル行の列数が揃っていない  ②1行に複数のエントリが混入している
#   ③テーブルの内側に空行がある
# 内容の妥当性（状態の整合・参照先の存在など）は見ない。
set -eu

cd "$(git rev-parse --show-toplevel)"

exec python3 - "$@" <<'PY'
import glob
import re
import sys

# 台帳とその完了記録。22 はチェックリスト・23 は節見出しで構造が違うが、
# テーブルを持つ場合に備えて同じ検査を掛けておく（テーブルが無ければ何も報告しない）
targets = sorted(
    glob.glob("docs/案件/2[123]_*.md")
    + glob.glob("docs/案件/closed_2[123]_*.md")
)

# 行頭が | で始まり ID らしきセルを持つ行を「エントリ行」とみなす
entry_re = re.compile(r"^\|\s*(FB|T|F|N)-\d+\s*\|")
# 区切り行（|---|---| 等）
sep_re = re.compile(r"^\|[\s:-]+\|[\s:|-]*$")

failures = []

for path in targets:
    lines = open(path, encoding="utf-8").read().split("\n")
    # 同じテーブル内で期待する列数（最初のヘッダ行から決める）
    expected = None
    for i, line in enumerate(lines, start=1):
        prev = lines[i - 2] if i >= 2 else ""
        nxt = lines[i] if i < len(lines) else ""

        if sep_re.match(line):
            expected = line.count("|") - 1
            continue

        # ③テーブルの内側の空行（前後がどちらもテーブル行）
        if line.strip() == "" and prev.startswith("|") and nxt.startswith("|"):
            failures.append((path, i, "テーブルの内側に空行がある"))
            continue

        if not entry_re.match(line):
            continue

        # ②1行に複数エントリ（行頭以外に ID セルが現れる）
        if len(re.findall(r"\|\s*(?:FB|T|F|N)-\d+\s*\|", line)) > 1:
            failures.append((path, i, "1行に複数のエントリが混入している"))
            continue

        # ①列数（セル内に | を書く運用はないので単純に数える）
        cols = line.count("|") - 1
        if expected is not None and cols != expected:
            failures.append((path, i, f"列数が {cols}（このテーブルは {expected}）"))

if failures:
    print("台帳の表構造に問題があります:", file=sys.stderr)
    for path, line_no, reason in failures:
        print(f"  {path}:{line_no}  {reason}", file=sys.stderr)
    sys.exit(1)

print(f"台帳の表構造は健全です（{len(targets)} ファイルを検査）")
PY
