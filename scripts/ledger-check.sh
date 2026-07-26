#!/bin/sh
# 台帳の表構造を検査する（T-36）。設計は docs/案件/23_技術改善バックログ.md T-36。
#
# 使い方:
#   npm run ledger:check
#
# 検査するのは「AI が手編集して壊した実績のある型」だけ:
#   ①テーブル行の列数が揃っていない  ②1行に複数のエントリが混入している
#   ③テーブルの内側に空行がある
#   ④台帳21・23 で §一覧の行と §詳細の節が1対1になっていない（片方だけ残る／重複する）
#   ⑤台帳21・23 で詳細列のリンク先アンカーが行の ID と食い違う
#   ⑥台帳22 で熟度タグが語彙外・トリガ欄が空（トリガの無い行は next-task が永久に拾わない）
#     ＋「仕様済」なのに参照先が `（未実装 / F-XXX）` のスタブ（過大申告は静かに起きる）
#   ⑦台帳23 で種別・優先度が語彙外
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


# ④⑤ 台帳21・23 は「§一覧の1行 ＋ §詳細の1節」で1エントリ。
# 片方だけの手編集で索引と本文が離れる事故を防ぐ。closed_* の「旧書式の記録」は
# 別の `## ` 節なので、§一覧・§詳細の範囲を切って見るだけで自然に対象外になる
def section_lines(lines, name):
    start = next((i for i, l in enumerate(lines) if l.strip() == f"## {name}"), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return list(enumerate(lines[start + 1 : end], start=start + 2))


paired = sorted(
    glob.glob("docs/案件/2[13]_*.md") + glob.glob("docs/案件/closed_2[13]_*.md")
)
for path in paired:
    lines = open(path, encoding="utf-8").read().split("\n")
    index = section_lines(lines, "一覧")
    detail = section_lines(lines, "詳細")
    if index is None or detail is None:
        failures.append((path, 1, "§一覧 または §詳細 の節が無い"))
        continue

    listed = {}
    for line_no, line in index:
        m = re.match(r"^\|\s*((?:FB|T)-\d+)\s*\|", line)
        if not m:
            continue
        entry_id = m.group(1)
        if entry_id in listed:
            failures.append((path, line_no, f"{entry_id} の行が §一覧に複数ある"))
        listed[entry_id] = line_no
        # ⑤詳細列のリンク先が自分の ID を指しているか（列位置は台帳ごとに違うので行全体で見る）
        if f"(#{entry_id.lower()})" not in line:
            failures.append((path, line_no, f"{entry_id} の詳細リンクが (#{entry_id.lower()}) を指していない"))

    described = {}
    for line_no, line in detail:
        m = re.match(r"^###\s+((?:FB|T)-\d+)\s*$", line)
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


# ⑥ 台帳22 は索引と詳細に分けず1エントリ1行。表にしたのは列で記入を強制するためなので、
# 「埋まっているか」をここで見る。トリガは特に落ちやすい（平文だった頃は書かなくても成立した）
MATURITY = {"仕様済", "設計済", "列済", "未詰め", "-"}

# 「仕様済」を名乗れるのは参照先に操作仕様の実体があるときだけ。`（未実装 / F-XXX）` が付いた条項は
# 要求文の言い換えなので該当しない（guide_21 の完了チェック3 が付ける印）。実績として、起票時から
# 仕様済だった F-117 が着手時に UI をまるごと決め直しており、この過大申告は静かに起きる
stub_ids = set()
for path in glob.glob("docs/仕様/**/*.md", recursive=True):
    stub_ids |= set(re.findall(r"（未実装 / ((?:F|N)-\d+)", open(path, encoding="utf-8").read()))

for path in sorted(glob.glob("docs/案件/22_*.md")):
    lines = open(path, encoding="utf-8").read().split("\n")
    for line_no, line in enumerate(lines, start=1):
        if not re.match(r"^\|\s*(?:F|N)-\d+\s*\|", line):
            continue
        cells = [c.strip() for c in line.split("|")]
        # "| ID | タイトル | 熟度 | 内容 | トリガ | 参照 |" → 前後の空要素を含めて 8 要素
        if len(cells) != 8:
            continue  # 列数の異常は①が報告済み
        entry_id, maturity, trigger = cells[1], cells[3], cells[5]
        if maturity not in MATURITY:
            failures.append((path, line_no, f"{entry_id} の熟度タグ「{maturity}」が語彙外"))
        if maturity == "仕様済" and entry_id in stub_ids:
            failures.append((path, line_no, f"{entry_id} は仕様済だが参照先が `（未実装 / {entry_id}）` のスタブ"))
        if trigger in ("", "-"):
            failures.append((path, line_no, f"{entry_id} のトリガ欄が空（着手条件を必ず書く）"))


# ⑦ 台帳23 の種別は「何に触るか」で分ける語彙。本書の全件に当てはまる語（負債返済・改善など）を
# 使うと種別として情報量がなくなるため、宣言した語だけを許す
KINDS = {"内部設計", "型安全", "テスト", "ツール整備", "依存追随", "調査"}
PRIORITIES = {"高", "中", "低", "様子見"}

for path in sorted(glob.glob("docs/案件/23_*.md")):
    lines = open(path, encoding="utf-8").read().split("\n")
    for line_no, line in enumerate(lines, start=1):
        if not re.match(r"^\|\s*T-\d+\s*\|", line):
            continue
        cells = [c.strip() for c in line.split("|")]
        # "| ID | タイトル | 種別 | 優先度 | 状態 | 詳細 |" → 前後の空要素を含めて 8 要素
        if len(cells) != 8:
            continue  # 列数の異常は①が報告済み
        entry_id, kind, priority = cells[1], cells[3], cells[4]
        if kind not in KINDS:
            failures.append((path, line_no, f"{entry_id} の種別「{kind}」が語彙外"))
        if priority not in PRIORITIES:
            failures.append((path, line_no, f"{entry_id} の優先度「{priority}」が語彙外"))

if failures:
    print("台帳の表構造に問題があります:", file=sys.stderr)
    for path, line_no, reason in failures:
        print(f"  {path}:{line_no}  {reason}", file=sys.stderr)
    sys.exit(1)

print(f"台帳の表構造は健全です（{len(targets)} ファイルを検査）")
PY
