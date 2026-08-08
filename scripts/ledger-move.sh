#!/bin/sh
# 台帳のエントリを完了記録へ移す（T-36）。
# 設計は docs/案件/closed_23_技術改善バックログ.md T-36 / docs/仕様/16_git運用と並行開発体制定義書.md §3.4。
#
# 使い方:
#   npm run ledger:move -- FB-54
#   npm run ledger:move -- FB-54 --status '対応済み 2026-07-25 → …（新しい状態列の全文）'
#   npm run ledger:move -- T-59  --status '完了 2026-07-27 → …'
#
# 台帳21（FB-XX）と台帳23（T-XX）の当該エントリを、それぞれの完了記録へ移す。
# --status を与えると状態列を差し替える（両台帳とも5番目のセル）。
#
# 1エントリは「§一覧の1行」と「§詳細の `### <ID>` 節」の2か所に分かれており、
# 両方を移さないと索引と本文が離れる。手編集で片方を置き忘れる事故を防ぐための道具。
# 行の切り出しは ID の完全一致で行い部分文字列をアンカーにしない／挿入はテーブルの内側
# （最終行の直後）に限る、の2点も機械で守る。
# 22 はチェックリストで構造が違い1行が短く手編集で壊れにくいため、検査（docs:check）だけを掛ける。
set -eu

# 素の `cd "$(git rev-parse --show-toplevel)"` はリポジトリ外で空文字列の cd になり、
# 失敗扱いにならないままカレントディレクトリで走り出す（読めない理由で落ちて原因が分かりにくい）
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "hitosuji リポジトリの中で実行してください" >&2
  exit 1
}
cd "$repo_root"

exec python3 - "$@" <<'PY'
import re
import sys

args = sys.argv[1:]
if not args:
    print("使い方: npm run ledger:move -- <FB-XX|T-XX> [--status '<新しい状態列>']", file=sys.stderr)
    sys.exit(1)

# 台帳ごとの差は3つだけ。ここに閉じ込めて、以降の処理は共通にする
#   columns    … 一覧の列数（状態は両者とも5番目のセル）
#   classified … 一覧が分類（### 見出し）で分かれているか。21 は分かれ、23 は1枚の表
LEDGERS = {
    "FB": {
        "live": "docs/案件/21_ユーザーフィードバック.md",
        "closed": "docs/案件/closed_21_ユーザーフィードバック.md",
        "columns": 5,
        "classified": True,
    },
    "T": {
        "live": "docs/案件/23_技術改善バックログ.md",
        "closed": "docs/案件/closed_23_技術改善バックログ.md",
        "columns": 6,
        "classified": False,
    },
}

entry_id = args[0]
matched = re.fullmatch(r"(FB|T)-\d+", entry_id)
if not matched:
    print(f"ID は FB-XX または T-XX の形で指定してください（受け取った値: {entry_id}）", file=sys.stderr)
    sys.exit(1)
ledger = LEDGERS[matched.group(1)]

new_status = None
if len(args) >= 3 and args[1] == "--status":
    new_status = args[2]
elif len(args) >= 2:
    print(f"認識できない引数: {args[1:]}", file=sys.stderr)
    sys.exit(1)

LIVE = ledger["live"]
CLOSED = ledger["closed"]

live = open(LIVE, encoding="utf-8").read().split("\n")
closed = open(CLOSED, encoding="utf-8").read().split("\n")


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


# `## <name>` の節の範囲（見出しの次行から、次の `## ` の直前まで）を返す
def section_range(lines, name):
    start = next((i for i, l in enumerate(lines) if l.strip() == f"## {name}"), None)
    if start is None:
        fail(f"「## {name}」の節が見つかりません")
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return start, end


# ---- ライブ台帳から一覧の行を取り出す ----

# ID の完全一致で行を特定する（部分文字列でのアンカーは破損の原因なので使わない）
row_re = re.compile(rf"^\|\s*{re.escape(entry_id)}\s*\|")
hits = [i for i, line in enumerate(live) if row_re.match(line)]
if not hits:
    fail(f"{entry_id} の行が {LIVE} に見つかりません")
if len(hits) > 1:
    fail(f"{entry_id} の行が {len(hits)} 件あります（{[i + 1 for i in hits]} 行目）。先に重複を解消してください")
row_idx = hits[0]
row = live[row_idx]

# 分類を持つ台帳（21）は直近の `### 分類` を拾い、移動先で同じ分類の節へ入れる
section = None
if ledger["classified"]:
    section = next((l[4:].strip() for l in reversed(live[:row_idx]) if l.startswith("### ")), None)
    if section is None:
        fail(f"{entry_id} の行が属する分類（### 見出し）を特定できません")

# 例: "| ID | 起票日 | タイトル | 詳細 | 状態 |" → 前後の空要素を含めて 7 要素
# （セル内に | を書く運用はない。書くと列がずれるのでここで落ちる）
cells = row.split("|")
if len(cells) != ledger["columns"] + 2:
    fail(f"想定外の列数です（{len(cells) - 2} 列・この台帳は {ledger['columns']} 列）。手で直してから再実行してください")
if new_status is not None:
    cells[5] = f" {new_status} "
    row = "|".join(cells)

# ---- ライブ台帳から詳細節を取り出す ----

detail_start = next(
    (i for i, l in enumerate(live) if l.strip() == f"### {entry_id}"), None
)
if detail_start is None:
    fail(
        f"{entry_id} の詳細節（### {entry_id}）が {LIVE} に見つかりません。"
        "一覧の行と詳細節は対で持つ運用です"
    )
detail_end = next(
    (i for i in range(detail_start + 1, len(live)) if live[i].startswith(("## ", "### "))),
    len(live),
)
detail = live[detail_start:detail_end]
while detail and detail[-1].strip() == "":
    detail.pop()

# ---- 移動先へ入れる ----

index_start, index_end = section_range(closed, "一覧")

# 移動先の同名節を探す。見出しは両ファイルで同一に保つ運用なので完全一致を第一候補にする。
# 先頭語だけで照合すると「改善（軽微 …）」と「改善（要仕様整理 …）」を区別できない（実際に誤爆した）
def heading_of(line):
    return line[4:].strip() if line.startswith("### ") else None


# 補足（「 — …」以降）の差異だけは許す。ここまでで一致しなければ推測せず失敗させる
def key_of(title):
    return re.split(r"\s+—\s*", title, maxsplit=1)[0]


scope = range(index_start, index_end)
if section is None:
    # 分類を持たない台帳（23）は §一覧が1枚の表。先頭から末尾までが対象
    target = index_start
else:
    target = next((i for i in scope if heading_of(closed[i]) == section), None)
    if target is None:
        cands = [i for i in scope if heading_of(closed[i]) and key_of(heading_of(closed[i])) == key_of(section)]
        if len(cands) > 1:
            fail(f"移動先 {CLOSED} §一覧に「{key_of(section)}」で始まる節が複数あり判別できません")
        target = cands[0] if cands else None
    if target is None:
        fail(f"移動先 {CLOSED} §一覧に「{section}」に対応する節が見つかりません")

# その節のテーブルの最終行を探し、その直後へ挿入する（節見出しとの区切り空行の下に入れない）
insert_at = None
for i in range(target + 1, index_end):
    if closed[i].startswith("### "):
        break
    if closed[i].startswith("|"):
        insert_at = i + 1
if insert_at is None:
    fail(f"移動先 {CLOSED} §一覧にテーブルが見つかりません")

# 詳細節は移動先 §詳細 の末尾へ積む（並び順は一覧と同じ、が運用ルール）
_, detail_section_end = section_range(closed, "詳細")

closed[detail_section_end:detail_section_end] = detail + [""]
closed.insert(insert_at, row)

# ライブ側は後ろ（詳細節）から消す。先に行を消すと詳細節の添字がずれる
del live[detail_start:detail_end]
del live[row_idx]

open(LIVE, "w", encoding="utf-8").write("\n".join(live))
open(CLOSED, "w", encoding="utf-8").write("\n".join(closed))

where = f"「{section}」から " if section else ""
print(f"{entry_id} を {where}{CLOSED} へ移しました（一覧の行と詳細節の2か所）")
if new_status is not None:
    print("状態列を差し替えました")
# 移送は移した側しか直さないので、検査までを1つの手順として案内する
print(f"npm run docs:check で構造と、{entry_id} を指す既存リンクの向き先を確認してください")
PY
