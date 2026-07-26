#!/bin/sh
# 台帳の表構造を検査する（T-36）。設計は docs/案件/23_技術改善バックログ.md T-36。
#
# 使い方:
#   npm run ledger:check
#
# 検査するのは「AI が手編集して壊した実績のある型」だけ:
#   ①テーブル行の列数が揃っていない  ②1行に複数のエントリが混入している
#   ③テーブルの内側に空行がある
#   ④台帳21 で §一覧の行と §詳細の節が1対1になっていない（片方だけ残る／重複する）
#   ⑤台帳21 で詳細列のリンク先アンカーが行の ID と食い違う
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


# ④⑤ 台帳21 は「§一覧の1行 ＋ §詳細の1節」で1エントリ（台帳21 運用ルール3）。
# 片方だけの手編集で索引と本文が離れる事故を防ぐ。closed_21 の「旧書式の記録」は
# 別の `## ` 節なので、§一覧・§詳細の範囲を切って見るだけで自然に対象外になる
def section_lines(lines, name):
    start = next((i for i, l in enumerate(lines) if l.strip() == f"## {name}"), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return list(enumerate(lines[start + 1 : end], start=start + 2))


for path in sorted(glob.glob("docs/案件/21_*.md") + glob.glob("docs/案件/closed_21_*.md")):
    lines = open(path, encoding="utf-8").read().split("\n")
    index = section_lines(lines, "一覧")
    detail = section_lines(lines, "詳細")
    if index is None or detail is None:
        failures.append((path, 1, "§一覧 または §詳細 の節が無い"))
        continue

    listed = {}
    for line_no, line in index:
        m = re.match(r"^\|\s*(FB-\d+)\s*\|", line)
        if not m:
            continue
        entry_id = m.group(1)
        if entry_id in listed:
            failures.append((path, line_no, f"{entry_id} の行が §一覧に複数ある"))
        listed[entry_id] = line_no
        # ⑤詳細列（4列目）のリンク先が自分の ID を指しているか
        cells = line.split("|")
        if len(cells) == 7 and f"(#{entry_id.lower()})" not in cells[4]:
            failures.append((path, line_no, f"{entry_id} の詳細リンクが (#{entry_id.lower()}) を指していない"))

    described = {}
    for line_no, line in detail:
        m = re.match(r"^###\s+(FB-\d+)\s*$", line)
        if not m:
            continue
        if m.group(1) in described:
            failures.append((path, line_no, f"{m.group(1)} の詳細節が複数ある"))
        described[m.group(1)] = line_no

    for entry_id, line_no in sorted(listed.items()):
        if entry_id not in described:
            failures.append((path, line_no, f"{entry_id} の詳細節（### {entry_id}）が無い"))
    for entry_id, line_no in sorted(described.items()):
        if entry_id not in listed:
            failures.append((path, line_no, f"{entry_id} の詳細節に対応する §一覧の行が無い"))

if failures:
    print("台帳の表構造に問題があります:", file=sys.stderr)
    for path, line_no, reason in failures:
        print(f"  {path}:{line_no}  {reason}", file=sys.stderr)
    sys.exit(1)

print(f"台帳の表構造は健全です（{len(targets)} ファイルを検査）")
PY
