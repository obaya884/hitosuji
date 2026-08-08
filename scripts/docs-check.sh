#!/bin/sh
# docs の機械検査（T-36 で台帳3冊の表構造から始まり、T-86 で docs 全体へ拡張した）。
# 設計は docs/案件/23_技術改善バックログ.md T-86。
#
# 使い方:
#   npm run docs:check
#
# 検査するのは「AI や手編集が実際に壊した実績のある型」だけで、内容の妥当性は見ない。
#
# エラー（終了コード 1。CI が落ちる）:
#   ①表の行のセル数がヘッダより多い（あふれた分は GitHub のレンダリングで丸ごと消える）
#     台帳3冊と closed_* ではセル数の不足も落とす（全列が必須のため）
#   ②1行に複数のエントリが混入している（台帳）
#   ③テーブルの内側に空行がある
#   ④台帳21・23 で §一覧の行と §詳細の節が1対1になっていない（片方だけ残る／重複する）
#   ⑤台帳21・23 で詳細列のリンク先アンカーが行の ID と食い違う
#   ⑥台帳22 で熟度タグが語彙外・トリガ欄が空（トリガの無い行は next-task が永久に拾わない）
#     ＋「仕様済」なのに参照先が `（未実装 / F-XXX）` のスタブ（過大申告は静かに起きる）
#   ⑦台帳23 で種別・優先度が語彙外
#   ⑧ライブ台帳に完了エントリが残っている（21 の対応済み・見送り／23 の完了）
#   ⑨相対リンクの参照先ファイルが無い
#   ⑩リンクのアンカーが参照先の見出しに無い（`ledger:move` は移す側しか直さないので、
#     closed_* への移送のたびに被参照リンクが構造的に切れる。それを捕まえるのが本検査の要）
#
# 警告（終了コードは 0 のまま。誤検知がありうるので落とさない）:
#   ⑪ライブ文書に Phase 表記が残っている（履歴を残す log_/closed_/archive_ は対象外）
#   ⑫ヘッダの更新日が git の最終更新日より古い（浅いクローンでは検査しない）
set -eu

cd "$(git rev-parse --show-toplevel)"

exec python3 - "$@" <<'PY'
import glob
import os
import re
import subprocess
import sys
import unicodedata

# ---- 検査対象 ---------------------------------------------------------------

# docs 全体＋リポジトリ直下の2文書。AGENTS.md は `next dev` が生成し直すので含めない
DOCS = sorted(glob.glob("docs/**/*.md", recursive=True))
ALL_DOCS = DOCS + ["CLAUDE.md", "README.md"]

# 台帳とその完了記録。22 はチェックリスト・23 は節見出しで構造が違うが、
# テーブルを持つ場合に備えて同じ検査を掛けておく（テーブルが無ければ何も報告しない）
LEDGERS = sorted(
    glob.glob("docs/案件/2[123]_*.md") + glob.glob("docs/案件/closed_2[123]_*.md")
)

failures = []
warnings = []


def read_lines(path):
    return open(path, encoding="utf-8").read().split("\n")


def fence_mask(lines):
    """``` で囲まれたコードブロックの行に True を立てる（見出し・リンクの誤検出を防ぐ）"""
    mask = []
    inside = False
    for line in lines:
        if re.match(r"^\s*(```|~~~)", line):
            inside = not inside
            mask.append(True)
        else:
            mask.append(inside)
    return mask


# ---- ①②③ 表構造 -----------------------------------------------------------

# 行頭が | で始まり ID らしきセルを持つ行を「エントリ行」とみなす
entry_re = re.compile(r"^\|\s*(FB|T|F|N)-\d+\s*\|")
# 区切り行（|---|---| 等）
sep_re = re.compile(r"^\|[\s:-]+\|[\s:|-]*$")

for path in ALL_DOCS:
    lines = read_lines(path)
    mask = fence_mask(lines)
    is_ledger = path in LEDGERS
    # 同じテーブル内で期待する列数（区切り行から決める）
    expected = None
    for i, line in enumerate(lines, start=1):
        if mask[i - 1]:
            continue
        prev = lines[i - 2] if i >= 2 else ""
        nxt = lines[i] if i < len(lines) else ""

        if sep_re.match(line):
            expected = line.count("|") - 1
            continue

        # ③テーブルの内側の空行（前後がどちらもテーブル行）。
        # 表を続けて2つ置くと空行の次がヘッダ行になるので、その先が区切り行なら別の表の始まり
        if line.strip() == "" and prev.startswith("|") and nxt.startswith("|"):
            after_next = lines[i + 1] if i + 1 < len(lines) else ""
            if not sep_re.match(after_next):
                failures.append((path, i, "テーブルの内側に空行がある"))
                continue

        if not line.startswith("|"):
            if line.strip() == "":
                expected = None  # 表の終わり
            continue

        # ②1行に複数エントリ（行頭以外に ID セルが現れる）。台帳の長大な1行を手編集して
        # 実際に3件壊した型で、ID を列に持つだけの表（log_22 の完了時熟度の表など）とは違う
        if is_ledger and entry_re.match(line) and len(re.findall(r"\|\s*(?:FB|T|F|N)-\d+\s*\|", line)) > 1:
            failures.append((path, i, "1行に複数のエントリが混入している"))
            continue

        # ①列数（セル内に | を書く運用はないので単純に数える）。
        # 多い側は表示が消えるので docs 全体で落とし、少ない側は全列必須の台帳だけで落とす
        # （log_* の理由列のように、書くことが無ければ空のままで良い表がある）
        if expected is None:
            continue
        cols = line.count("|") - 1
        if cols > expected:
            failures.append((path, i, f"列数が {cols}（この表は {expected}）。あふれた分は表示されない"))
        elif cols < expected and is_ledger:
            failures.append((path, i, f"列数が {cols}（この表は {expected}）"))


# ---- ④⑤ 台帳21・23 の一覧 ↔ 詳細 -------------------------------------------

# 台帳21・23 は「§一覧の1行 ＋ §詳細の1節」で1エントリ。
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
    lines = read_lines(path)
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


# ---- ⑥ 台帳22 の熟度タグとトリガ --------------------------------------------

# 台帳22 は索引と詳細に分けず1エントリ1行。表にしたのは列で記入を強制するためなので、
# 「埋まっているか」をここで見る。トリガは特に落ちやすい（平文だった頃は書かなくても成立した）
MATURITY = {"仕様済", "設計済", "列済", "未詰め", "-"}

# 「仕様済」を名乗れるのは参照先に操作仕様の実体があるときだけ。`（未実装 / F-XXX）` が付いた条項は
# 要求文の言い換えなので該当しない（guide_21 の完了チェック3 が付ける印）。実績として、起票時から
# 仕様済だった F-117 が着手時に UI をまるごと決め直しており、この過大申告は静かに起きる
stub_ids = set()
for path in glob.glob("docs/仕様/**/*.md", recursive=True):
    stub_ids |= set(re.findall(r"（未実装 / ((?:F|N)-\d+)", open(path, encoding="utf-8").read()))

for path in sorted(glob.glob("docs/案件/22_*.md")):
    for line_no, line in enumerate(read_lines(path), start=1):
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


# ---- ⑦⑧ 台帳23 の語彙・ライブ台帳の状態列 ----------------------------------

# 台帳23 の種別は「何に触るか」で分ける語彙。本書の全件に当てはまる語（負債返済・改善など）を
# 使うと種別として情報量がなくなるため、宣言した語だけを許す
KINDS = {"内部設計", "型安全", "テスト", "ツール整備", "依存追随", "調査"}
PRIORITIES = {"高", "中", "低", "様子見"}

for path in sorted(glob.glob("docs/案件/23_*.md")):
    for line_no, line in enumerate(read_lines(path), start=1):
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

# ライブ台帳には未完了だけを残す規約（CLAUDE.md「書き方の規約」）。移し忘れは状態列に現れる。
# どちらの台帳も一覧は5列目が状態（21: ID/起票日/タイトル/詳細/状態、23: ID/タイトル/種別/優先度/状態/詳細）
LIVE_STATUS = {
    "docs/案件/21_ユーザーフィードバック.md": ("対応済み", "見送り"),
    "docs/案件/23_技術改善バックログ.md": ("完了",),
}
for path, closed_words in LIVE_STATUS.items():
    for line_no, line in enumerate(read_lines(path), start=1):
        m = re.match(r"^\|\s*((?:FB|T)-\d+)\s*\|", line)
        if not m:
            continue
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 7:
            continue  # 列数の異常は①が報告済み
        status = cells[5]
        for word in closed_words:
            if status.startswith(word):
                failures.append(
                    (path, line_no, f"{m.group(1)} が「{status}」のままライブ台帳に残っている（closed_ へ移す）")
                )


# ---- ⑨⑩ リンクとアンカー ---------------------------------------------------

def heading_slug(text):
    """GitHub の見出しアンカー規則: 小文字化し、英数字と - _ 以外を落とし、空白を - にする"""
    s = re.sub(r"<[^>]*>", "", text.strip())
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)  # リンクは表示テキストだけ残る
    out = []
    for ch in s.lower():
        if ch in "-_":
            out.append(ch)
        elif ch.isspace():
            out.append("-")
        elif ch.isalnum():
            out.append(ch)
    return unicodedata.normalize("NFC", "".join(out))


def anchors_of(path):
    lines = read_lines(path)
    mask = fence_mask(lines)
    seen = {}
    found = set()
    for i, line in enumerate(lines):
        if mask[i]:
            continue
        m = re.match(r"^(#{1,6})\s+(.*?)\s*$", line)
        if not m:
            continue
        s = heading_slug(m.group(2))
        n = seen.get(s, 0)
        seen[s] = n + 1
        # 同名見出しには GitHub が -1, -2 … を足す
        found.add(s if n == 0 else f"{s}-{n}")
    return found


anchor_cache = {}
# `[表示](対象)`。対象に空白・() は使わない運用なので単純に切り出す
link_re = re.compile(r"\[(?:[^\[\]]|\[[^\]]*\])*\]\(([^()\s]+)\)")
code_span_re = re.compile(r"`[^`]*`")

for path in ALL_DOCS:
    lines = read_lines(path)
    mask = fence_mask(lines)
    for i, line in enumerate(lines, start=1):
        if mask[i - 1]:
            continue
        # インラインコード内の記法例（`[詳細](#fb-xx)` など）はリンクではない
        for target in link_re.findall(code_span_re.sub("``", line)):
            if re.match(r"^(https?|mailto):", target):
                continue
            rel, _, frag = target.partition("#")
            if rel == "":
                dest = path
            else:
                dest = os.path.normpath(os.path.join(os.path.dirname(path), rel))
                if not os.path.exists(dest):
                    failures.append((path, i, f"リンク先が無い: {target}"))
                    continue
            if not frag or not dest.endswith(".md"):
                continue
            if dest not in anchor_cache:
                anchor_cache[dest] = anchors_of(dest)
            if unicodedata.normalize("NFC", frag.lower()) not in anchor_cache[dest]:
                failures.append((path, i, f"アンカーが無い: {target}"))


# ---- ⑪ Phase 表記の残存（警告） ---------------------------------------------

# 「完了した事項に予定表記を残さない」（CLAUDE.md「書き方の規約」）。
# 履歴を積む log_ / closed_ / archive_ は当時の呼び方が正なので対象外
phase_re = re.compile(r"(?<![A-Za-z])[Pp]hase\s*\d|フェーズ\s*\d")
for path in ALL_DOCS:
    if re.match(r"(log_|closed_|archive_)", os.path.basename(path)):
        continue
    lines = read_lines(path)
    mask = fence_mask(lines)
    for i, line in enumerate(lines, start=1):
        if mask[i - 1]:
            continue
        if phase_re.search(code_span_re.sub("``", line)):
            warnings.append((path, i, "Phase 表記が残っている（現況は要件定義書 §3・要件バックログが持つ）"))


# ---- ⑫ ヘッダの更新日と git の最終更新日（警告） ----------------------------

# 浅いクローンでは `git log` が正しい最終更新を返さないので黙って飛ばす
shallow = subprocess.run(
    ["git", "rev-parse", "--is-shallow-repository"], capture_output=True, text=True
).stdout.strip() == "true"

if not shallow:
    for path in DOCS:
        m = re.search(r"^- 更新日: (\d{4}-\d{2}-\d{2})", open(path, encoding="utf-8").read(), re.M)
        if not m:
            continue
        last = subprocess.run(
            ["git", "log", "-1", "--format=%ad", "--date=short", "--", path],
            capture_output=True,
            text=True,
        ).stdout.strip()
        if last and last > m.group(1):
            warnings.append((path, 1, f"更新日 {m.group(1)} が git の最終更新 {last} より古い"))


# ---- 報告 -------------------------------------------------------------------

for path, line_no, reason in warnings:
    print(f"警告: {path}:{line_no}  {reason}")

if failures:
    print("docs に問題があります:", file=sys.stderr)
    for path, line_no, reason in sorted(failures):
        print(f"  {path}:{line_no}  {reason}", file=sys.stderr)
    sys.exit(1)

print(f"docs は健全です（{len(ALL_DOCS)} ファイルを検査、警告 {len(warnings)} 件）")
PY
