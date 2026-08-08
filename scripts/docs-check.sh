#!/bin/sh
# docs の機械検査（T-36 で台帳3冊の表構造から始まり、T-86 で docs 全体へ拡張した）。
# 設計は docs/案件/closed_23_技術改善バックログ.md T-86。
#
# 使い方:
#   npm run docs:check
#
# 検査するのは「AI や手編集が実際に壊した実績のある型」だけで、内容の妥当性は見ない。
#
# エラー（終了コード 1。CI が落ちる）:
#   - 区切り行の列数がヘッダと違う（GFM はその塊を表として描画せず生のパイプ文字列になる）
#   - 行のセル数がヘッダより多い（あふれた分は丸ごと消える）
#     台帳3冊と closed_* ではセル数の不足も落とす（全列が必須のため）
#   - テーブルの内側に空行がある
#   - 台帳の1行に複数のエントリが混入している
#   - 台帳21・23 で §一覧の行と §詳細の節が1対1になっていない（片方だけ残る／重複する）
#   - 台帳21・23 で詳細列のリンク先アンカーが行の ID と食い違う
#   - 台帳22 で熟度タグが語彙外・トリガ欄が空（トリガの無い行は next-task が永久に拾わない）
#     ＋「仕様済」なのに参照先が `（未実装 / F-XXX）` のスタブ（過大申告は静かに起きる）
#   - 台帳23 で種別・優先度が語彙外
#   - ライブ台帳に完了エントリが残っている（21 の対応済み・見送り／23 の完了）
#   - 相対リンクの参照先ファイルが無い
#   - リンクのアンカーが参照先の見出しに無い（`ledger:move` は移す側しか直さないので、
#     closed_* への移送のたびに被参照リンクが構造的に切れる。それを捕まえるのが本検査の要）
#   - 台帳3冊とその完了記録のいずれかが見つからない（検査対象そのものの欠落）
#
# 警告（終了コードは 0 のまま。誤検知がありうるので落とさない）:
#   - ライブ文書に Phase 表記が残っている（履歴を残す log_/closed_/archive_ は対象外）
#   - ヘッダの更新日が古い（未コミットの編集なら「今日でない」、コミット済みなら git の最終更新と比較）
set -eu

# 素の `cd "$(git rev-parse --show-toplevel)"` はリポジトリ外で空文字列の cd になり、
# 失敗扱いにならないままカレントディレクトリで走り出す（読めない理由で落ちて原因が分かりにくい）
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "hitosuji リポジトリの中で実行してください" >&2
  exit 1
}
cd "$repo_root"

exec python3 - "$@" <<'PY'
import datetime
import glob
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote

# ---- 検査対象 ---------------------------------------------------------------

# 更新日ヘッダを持ちうるのは docs/ 配下だけなので、その一覧は別に取っておく
DOCS = sorted(glob.glob("docs/**/*.md", recursive=True))
# 参照は docs 内だけでなく CLAUDE.md・README・`.claude/` にも散る（CLAUDE.md「書き方の規約」）。
# AGENTS.md だけは `next dev` が生成し直すので対象から外す
TARGETS = DOCS + ["CLAUDE.md", "README.md"] + sorted(glob.glob(".claude/**/*.md", recursive=True))

# 台帳の所在は1か所にまとめる（ファイル名が変わったときに直す場所を散らさない）。
# `paired` は「§一覧の行 ＋ §詳細の節」の書式かどうか、`closed_status` はライブ側に
# 残っていたらエラーにする状態列の語
LEDGERS = {
    "21": {
        "live": "docs/案件/21_ユーザーフィードバック.md",
        "closed": "docs/案件/closed_21_ユーザーフィードバック.md",
        "paired": True,
        "closed_status": ("対応済み", "見送り"),
    },
    "22": {
        "live": "docs/案件/22_要件バックログ.md",
        "closed": "docs/案件/closed_22_要件バックログ.md",
        "paired": False,
        "closed_status": (),
    },
    "23": {
        "live": "docs/案件/23_技術改善バックログ.md",
        "closed": "docs/案件/closed_23_技術改善バックログ.md",
        "paired": True,
        "closed_status": ("完了",),
    },
}
# 台帳とその完了記録は「全列が必須」なので、表の検査を厳しい側に倒す集合
LEDGER_FILES = {p for l in LEDGERS.values() for p in (l["live"], l["closed"])}


# ---- 読み込み ---------------------------------------------------------------

_docs = {}


def fence_mask(lines):
    """``` / ~~~ で囲まれた行に True を立てる（見出し・リンク・表の誤検出を防ぐ）。
    開いたマーカーを覚えて同じ種類でだけ閉じる——共有すると、片方の中に他方が現れた時点で
    以降のファイル全体が「フェンス内」になり検査が静かに消える"""
    mask = []
    opened = None
    for line in lines:
        m = re.match(r"^\s*(`{3,}|~{3,})", line)
        if m and opened is None:
            opened = m.group(1)[0]
            mask.append(True)
        elif m and m.group(1)[0] == opened:
            opened = None
            mask.append(True)
        else:
            mask.append(opened is not None)
    return mask


def read(path):
    """(行, コードフェンス内フラグ) を返す。**ファイルを開く入口はここだけ**にして、
    同じファイルを何度も読み直さない（検査が9つあり、大半が同じ母集団を舐める）"""
    if path not in _docs:
        lines = Path(path).read_text(encoding="utf-8").split("\n")
        _docs[path] = (lines, fence_mask(lines))
    return _docs[path]


def text(path):
    """全文が要る検査（正規表現を行にまたがって当てる側）のための read() の別口"""
    return "\n".join(read(path)[0])


# セル数は素直に数える。前提は「セル内に `|` を書かない」（エスケープ `\|`・インラインコード内の
# `|` も含めて運用で禁じている。台帳22・23 の書式節が正）と「行頭・行末のパイプを省略しない」
def cell_count(line):
    return line.count("|") - 1


def cells_of(line):
    """`| a | b |` → ['', 'a', 'b', '']。前後の空要素を含むので列数 + 2 個になる"""
    return [c.strip() for c in line.split("|")]


# 区切り行（|---|---| 等）
sep_re = re.compile(r"^\|[\s:-]+\|[\s:|-]*$")
# 行頭が | で始まり ID らしきセルを持つ行を「エントリ行」とみなす
entry_re = re.compile(r"^\|\s*(?:FB|T|F|N)-\d+\s*\|")


# ---- 表構造 -----------------------------------------------------------------


def check_tables(path):
    """GFM の表を「ヘッダ行 ＋ 区切り行 ＋ 本体」の塊として読み、構造の壊れを見る"""
    out = []
    lines, mask = read(path)
    strict = path in LEDGER_FILES
    n = len(lines)
    i = 0
    while i < n:
        # 表の始まりはヘッダ行で、その直後は必ず区切り行（GFM）。並んでいなければ表ではない
        if mask[i] or not lines[i].startswith("|") or i + 1 >= n or not sep_re.match(lines[i + 1]):
            i += 1
            continue

        expected_cols = cell_count(lines[i])
        sep_cols = cell_count(lines[i + 1])
        # 区切り行が合わないと表そのものが描画されないので、**本体行の列数はもう論じる意味がない**。
        # 照合を続けると根本原因1件に対して全行が鳴き、直すべき1行が埋もれる
        rendered = sep_cols == expected_cols
        if not rendered:
            out.append((path, i + 2, f"区切り行の列数が {sep_cols}（ヘッダは {expected_cols}）。表として描画されない"))
        i += 2

        while i < n and not mask[i]:
            line = lines[i]
            if line.strip() == "":
                # テーブルの内側の空行。表を続けて2つ置くと空行の次がヘッダ行になるので、
                # その先が区切り行なら別の表の始まり（＝ここで塊が終わっただけ）
                nxt = lines[i + 1] if i + 1 < n else ""
                after = lines[i + 2] if i + 2 < n else ""
                if not (nxt.startswith("|") and not sep_re.match(after)):
                    break
                out.append((path, i + 1, "テーブルの内側に空行がある"))
                i += 1
                continue
            if not line.startswith("|"):
                break

            # 1行に複数エントリ（行頭以外に ID セルが現れる）。台帳の長大な1行を手編集して
            # 実際に3件壊した型で、ID を列に持つだけの表（log_22 の完了時熟度の表など）とは違う。
            # 先読みで数えるのは `| T-1 | T-2 |` のように ID セルが隣接する形を数え落とさないため
            if strict and entry_re.match(line) and len(re.findall(r"\|\s*(?:FB|T|F|N)-\d+\s*(?=\|)", line)) > 1:
                out.append((path, i + 1, "1行に複数のエントリが混入している"))
                i += 1
                continue

            # あふれ側は GitHub が内容を落とすので docs 全体で、不足側は全列必須の台帳だけで落とす
            # （log_* の理由列のように、書くことが無ければ空のままで良い表がある）
            cols = cell_count(line)
            if rendered and cols > expected_cols:
                out.append((path, i + 1, f"列数が {cols}（この表は {expected_cols}）。あふれた分は表示されない"))
            elif rendered and cols < expected_cols and strict:
                out.append((path, i + 1, f"列数が {cols}（この表は {expected_cols}）。台帳は全列必須"))
            i += 1
    return out


# ---- 台帳21・23 の一覧 ↔ 詳細 -----------------------------------------------


def section_lines(lines, name):
    """`## <name>` から次の `## ` までを (行番号, 行) で返す。closed_* の「旧書式の記録」は
    別の `## ` 節なので、範囲を切って見るだけで自然に対象外になる"""
    start = next((i for i, l in enumerate(lines) if l.strip() == f"## {name}"), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return list(enumerate(lines[start + 1 : end], start=start + 2))


def check_index_and_detail(path):
    """台帳21・23 は「§一覧の1行 ＋ §詳細の1節」で1エントリ。
    片方だけの手編集で索引と本文が離れる事故を防ぐ"""
    out = []
    lines, _ = read(path)
    index = section_lines(lines, "一覧")
    detail = section_lines(lines, "詳細")
    if index is None or detail is None:
        return [(path, 1, "§一覧 または §詳細 の節が無い")]

    listed = {}
    for line_no, line in index:
        m = re.match(r"^\|\s*((?:FB|T)-\d+)\s*\|", line)
        if not m:
            continue
        entry_id = m.group(1)
        if entry_id in listed:
            out.append((path, line_no, f"{entry_id} の行が §一覧に複数ある"))
        listed[entry_id] = line_no
        # 詳細列のリンク先が自分の ID を指しているか（列位置は台帳ごとに違うので行全体で見る）
        if f"(#{entry_id.lower()})" not in line:
            out.append((path, line_no, f"{entry_id} の詳細リンクが (#{entry_id.lower()}) を指していない"))

    described = {}
    for line_no, line in detail:
        m = re.match(r"^###\s+((?:FB|T)-\d+)\s*$", line)
        if not m:
            continue
        if m.group(1) in described:
            out.append((path, line_no, f"{m.group(1)} の詳細節が複数ある"))
        described[m.group(1)] = line_no

    for entry_id, line_no in sorted(listed.items()):
        if entry_id not in described:
            out.append((path, line_no, f"{entry_id} の詳細節（### {entry_id}）が無い"))
    for entry_id, line_no in sorted(described.items()):
        if entry_id not in listed:
            out.append((path, line_no, f"{entry_id} の詳細節に対応する §一覧の行が無い"))
    return out


# ---- 台帳22 の熟度タグとトリガ ----------------------------------------------

# 台帳22 は索引と詳細に分けず1エントリ1行。表にしたのは列で記入を強制するためなので、
# 「埋まっているか」をここで見る。トリガは特に落ちやすい（平文だった頃は書かなくても成立した）
MATURITY = {"仕様済", "設計済", "列済", "未詰め", "-"}


def check_requirement_backlog(path):
    out = []
    # 「仕様済」を名乗れるのは参照先に操作仕様の実体があるときだけ。`（未実装 / F-XXX）` が付いた
    # 条項は要求文の言い換えなので該当しない（guide_21 の完了チェック3 が付ける印）。実績として、
    # 起票時から仕様済だった F-117 が着手時に UI をまるごと決め直しており、この過大申告は静かに起きる
    stub_ids = set()
    for spec_doc in glob.glob("docs/仕様/**/*.md", recursive=True):
        stub_ids |= set(re.findall(r"（未実装 / ((?:F|N)-\d+)", text(spec_doc)))

    lines, _ = read(path)
    for line_no, line in enumerate(lines, start=1):
        if not re.match(r"^\|\s*(?:F|N)-\d+\s*\|", line):
            continue
        cells = cells_of(line)
        # "| ID | タイトル | 熟度 | 内容 | トリガ | 参照 |" → 前後の空要素を含めて 8 要素
        if len(cells) != 8:
            continue  # 列数の異常は表構造の検査が報告済み
        entry_id, maturity, trigger = cells[1], cells[3], cells[5]
        if maturity not in MATURITY:
            out.append((path, line_no, f"{entry_id} の熟度タグ「{maturity}」が語彙外"))
        if maturity == "仕様済" and entry_id in stub_ids:
            out.append((path, line_no, f"{entry_id} は仕様済だが参照先が `（未実装 / {entry_id}）` のスタブ"))
        if trigger in ("", "-"):
            out.append((path, line_no, f"{entry_id} のトリガ欄が空（着手条件を必ず書く）"))
    return out


# ---- 台帳23 の語彙 -----------------------------------------------------------

# 台帳23 の種別は「何に触るか」で分ける語彙。本書の全件に当てはまる語（負債返済・改善など）を
# 使うと種別として情報量がなくなるため、宣言した語だけを許す
KINDS = {"内部設計", "型安全", "テスト", "ツール整備", "依存追随", "調査"}
PRIORITIES = {"高", "中", "低", "様子見"}


def check_tech_backlog(path):
    out = []
    lines, _ = read(path)
    for line_no, line in enumerate(lines, start=1):
        if not re.match(r"^\|\s*T-\d+\s*\|", line):
            continue
        cells = cells_of(line)
        # "| ID | タイトル | 種別 | 優先度 | 状態 | 詳細 |" → 前後の空要素を含めて 8 要素
        if len(cells) != 8:
            continue  # 列数の異常は表構造の検査が報告済み
        entry_id, kind, priority = cells[1], cells[3], cells[4]
        if kind not in KINDS:
            out.append((path, line_no, f"{entry_id} の種別「{kind}」が語彙外"))
        if priority not in PRIORITIES:
            out.append((path, line_no, f"{entry_id} の優先度「{priority}」が語彙外"))
    return out


# ---- ライブ台帳の状態列 ------------------------------------------------------


def check_live_status(path, closed_status):
    """ライブ台帳には未完了だけを残す規約（CLAUDE.md「書き方の規約」）。移し忘れは状態列に現れる。
    どちらの台帳も一覧は5列目が状態（21: ID/起票日/タイトル/詳細/状態、23: ID/タイトル/種別/優先度/状態/詳細）"""
    out = []
    lines, _ = read(path)
    for line_no, line in enumerate(lines, start=1):
        m = re.match(r"^\|\s*((?:FB|T)-\d+)\s*\|", line)
        if not m:
            continue
        cells = cells_of(line)
        if len(cells) < 7:
            continue  # 列数の異常は表構造の検査が報告済み
        status = cells[5]
        for word in closed_status:
            if status.startswith(word):
                out.append((path, line_no, f"{m.group(1)} が「{status}」のままライブ台帳に残っている（closed_ へ移す）"))
    return out


# ---- リンクとアンカー --------------------------------------------------------


def heading_slug(text):
    """GitHub の見出しアンカー規則: 小文字化し、英数字と - _ 以外を落とし、空白を - にする。
    合成済みの文字（NFC）に揃えてから落とす——先に落とすと結合文字だけが消えて別の字になる"""
    s = re.sub(r"<[^>]*>", "", unicodedata.normalize("NFC", text.strip()))
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)  # リンクは表示テキストだけ残る
    out = []
    for ch in s.lower():
        if ch in "-_":
            out.append(ch)
        elif ch.isspace():
            out.append("-")
        elif ch.isalnum():
            out.append(ch)
    return "".join(out)


_anchors = {}


def anchors_of(path):
    if path not in _anchors:
        lines, mask = read(path)
        seen = {}
        slugs = set()
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
            slugs.add(s if n == 0 else f"{s}-{n}")
        _anchors[path] = slugs
    return _anchors[path]


# `[表示](対象)`。対象に空白・() は使わない運用なので単純に切り出す
link_re = re.compile(r"\[(?:[^\[\]]|\[[^\]]*\])*\]\(([^()\s]+)\)")
code_span_re = re.compile(r"`[^`]*`")


def check_links(path):
    out = []
    lines, mask = read(path)
    for i, line in enumerate(lines, start=1):
        if mask[i - 1]:
            continue
        # インラインコード内の記法例（`[詳細](#fb-xx)` など）はリンクではない
        for target in link_re.findall(code_span_re.sub("``", line)):
            if re.match(r"^(https?|mailto):", target):
                continue
            # GitHub の「リンクをコピー」は日本語見出しを %XX で返すので戻してから突き合わせる
            rel, _, frag = unquote(target).partition("#")
            if rel == "":
                dest = path
            else:
                dest = os.path.normpath(os.path.join(os.path.dirname(path), rel))
                if not os.path.exists(dest):
                    out.append((path, i, f"リンク先が無い: {target}"))
                    continue
            if not frag or not dest.endswith(".md"):
                continue
            if unicodedata.normalize("NFC", frag.lower()) not in anchors_of(dest):
                out.append((path, i, f"アンカーが無い: {target}"))
    return out


# ---- Phase 表記の残存（警告） ------------------------------------------------

# 「完了した事項に予定表記を残さない」（CLAUDE.md「書き方の規約」）。
# 履歴を積む log_ / closed_ / archive_ は当時の呼び方が正なので対象外
phase_re = re.compile(r"(?<![A-Za-z])[Pp]hase\s*\d|フェーズ\s*\d")


def check_phase_wording(path):
    if re.match(r"(log_|closed_|archive_)", os.path.basename(path)):
        return []
    out = []
    lines, mask = read(path)
    for i, line in enumerate(lines, start=1):
        if mask[i - 1]:
            continue
        if phase_re.search(code_span_re.sub("``", line)):
            out.append((path, i, "Phase 表記が残っている（現況は要件定義書 §3・要件バックログが持つ）"))
    return out


# ---- ヘッダの更新日（警告） --------------------------------------------------


def git(*args, strip=True):
    """git の標準出力。`--porcelain` の状態欄は行頭の空白に意味があるので strip=False で取る
    （git が居ないケースは考えない——sh ラッパが `git rev-parse` を通ってここまで来ている）"""
    out = subprocess.run(["git", *args], capture_output=True, text=True).stdout
    return out.strip() if strip else out


def check_updated_dates():
    """未コミットの編集は「今日でなければ」、コミット済みは git の最終更新と比べる。
    前者を見るのは、本検査をコミット前に回す運用だと後者だけでは**これから作る乖離**が
    素通りするため（`git log` は前回コミットの日付しか知らない）"""
    out = []
    today = datetime.date.today().isoformat()
    # -z（NUL 区切り）で取るのは、既定の `--porcelain` が非 ASCII のパスを
    # `"docs/\344\273\225..."` とクォートして返し、そのままでは突き合わせられないため。
    # リネームは新旧2件が並ぶが、旧パス側は先頭2文字の状態欄を持たないので弾かれる
    raw = git("status", "--porcelain", "-z", "--", "docs", strip=False)
    dirty = {e[3:] for e in raw.split("\0") if len(e) > 3 and e[2] == " "}
    # 浅いクローンでは `git log` が正しい最終更新を返さないので、そちら側は黙って飛ばす
    shallow = git("rev-parse", "--is-shallow-repository") == "true"

    for path in DOCS:
        m = re.search(r"^- 更新日: (\d{4}-\d{2}-\d{2})", text(path), re.M)
        if not m:
            continue
        if path in dirty:
            if m.group(1) != today:
                out.append((path, 1, f"編集中だが更新日が {m.group(1)} のまま（今日は {today}）"))
            continue
        if shallow:
            continue
        last = git("log", "-1", "--format=%ad", "--date=short", "--", path)
        if last and last > m.group(1):
            out.append((path, 1, f"更新日 {m.group(1)} が git の最終更新 {last} より古い"))
    return out


# ---- 実行 -------------------------------------------------------------------

failures = []
warnings = []

for path in TARGETS:
    failures += check_tables(path)
    failures += check_links(path)
    warnings += check_phase_wording(path)

# ライブ側だけが持つ固有の検査（列の記入・語彙）。LEDGERS に併記できないのは、
# 辞書を組み立てる時点でこれらの関数がまだ定義されていないため
LEDGER_CHECKS = {"22": (check_requirement_backlog,), "23": (check_tech_backlog,)}

for key, entry in LEDGERS.items():
    for side in ("live", "closed"):
        path = entry[side]
        if not os.path.exists(path):
            failures.append((path, 1, "台帳が見つからない"))
            continue
        if entry["paired"]:
            failures += check_index_and_detail(path)
        if side != "live":
            continue
        failures += check_live_status(path, entry["closed_status"])
        for check in LEDGER_CHECKS.get(key, ()):
            failures += check(path)

warnings += check_updated_dates()

for path, line_no, reason in sorted(warnings):
    print(f"警告: {path}:{line_no}  {reason}")

if failures:
    print("docs に問題があります:", file=sys.stderr)
    for path, line_no, reason in sorted(failures):
        print(f"  {path}:{line_no}  {reason}", file=sys.stderr)
    sys.exit(1)

print(f"docs は健全です（{len(TARGETS)} ファイルを検査、警告 {len(warnings)} 件）")
PY
