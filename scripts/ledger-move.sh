#!/bin/sh
# ユーザーフィードバック管理簿の行を完了記録へ移す（T-36）。
# 設計は docs/案件/23_技術改善バックログ.md T-36 / docs/仕様/16_git運用と並行開発体制定義書.md §3.4。
#
# 使い方:
#   npm run ledger:move -- FB-54
#   npm run ledger:move -- FB-54 --status '対応済み 2026-07-25 → …（新しい状態列の全文）'
#
# 21_ユーザーフィードバック.md の当該行を、同じ分類の節を保ったまま
# closed_21_ユーザーフィードバック.md へ移す。--status を与えると状態列（4列目）を差し替える。
#
# 手編集を置き換えるための道具。1行が千文字を超えるため、行の切り出しは ID の完全一致で行い
# 部分文字列をアンカーにしない／挿入はテーブルの内側（最終行の直後）に限る、の2点を機械で守る。
# 対象は台帳21（テーブル）のみ。22 はチェックリスト・23 は節見出しで構造が違い、
# どちらも1行が短く手編集で壊れにくいため検査（ledger:check）だけを掛ける。
set -eu

cd "$(git rev-parse --show-toplevel)"

exec python3 - "$@" <<'PY'
import re
import sys

args = sys.argv[1:]
if not args:
    print("使い方: npm run ledger:move -- <FB-XX> [--status '<新しい状態列>']", file=sys.stderr)
    sys.exit(1)

entry_id = args[0]
if not re.fullmatch(r"FB-\d+", entry_id):
    print(f"ID は FB-XX の形で指定してください（受け取った値: {entry_id}）", file=sys.stderr)
    sys.exit(1)

new_status = None
if len(args) >= 3 and args[1] == "--status":
    new_status = args[2]
elif len(args) >= 2:
    print(f"認識できない引数: {args[1:]}", file=sys.stderr)
    sys.exit(1)

LIVE = "docs/案件/21_ユーザーフィードバック.md"
CLOSED = "docs/案件/closed_21_ユーザーフィードバック.md"

live = open(LIVE, encoding="utf-8").read().split("\n")
closed = open(CLOSED, encoding="utf-8").read().split("\n")

# ID の完全一致で行を特定する（部分文字列でのアンカーは破損の原因なので使わない）
row_re = re.compile(rf"^\|\s*{re.escape(entry_id)}\s*\|")
hits = [i for i, line in enumerate(live) if row_re.match(line)]
if not hits:
    print(f"{entry_id} の行が {LIVE} に見つかりません", file=sys.stderr)
    sys.exit(1)
if len(hits) > 1:
    print(f"{entry_id} の行が {len(hits)} 件あります（{[i + 1 for i in hits]} 行目）。先に重複を解消してください", file=sys.stderr)
    sys.exit(1)
idx = hits[0]
row = live[idx]

# 直近の見出し（### 分類）を拾い、移動先で同じ分類の節へ入れる
section = None
for line in reversed(live[:idx]):
    if line.startswith("### "):
        section = line[4:].strip()
        break
if section is None:
    print(f"{entry_id} の行が属する分類（### 見出し）を特定できません", file=sys.stderr)
    sys.exit(1)

if new_status is not None:
    cells = row.split("|")
    # "| ID | 起票日 | 内容 | 状態 |" → 前後の空要素を含めて 6 要素
    if len(cells) != 6:
        print(f"想定外の列数です（{len(cells) - 2} 列）。手で直してから再実行してください", file=sys.stderr)
        sys.exit(1)
    cells[4] = f" {new_status} "
    row = "|".join(cells)

# 移動先の同名節を探す。見出しは両ファイルで同一に保つ運用なので完全一致を第一候補にする。
# 先頭語だけで照合すると「改善（軽微 …）」と「改善（要仕様整理 …）」を区別できない（実際に誤爆した）
def heading_of(line):
    return line[3:].strip() if line.startswith("## ") else None


# 補足（「 — …」以降）の差異だけは許す。ここまでで一致しなければ推測せず失敗させる
def key_of(title):
    return re.split(r"\s+—\s*", title, maxsplit=1)[0]


target = next((i for i, l in enumerate(closed) if heading_of(l) == section), None)
if target is None:
    cands = [i for i, l in enumerate(closed) if heading_of(l) and key_of(heading_of(l)) == key_of(section)]
    if len(cands) == 1:
        target = cands[0]
    elif len(cands) > 1:
        print(f"移動先 {CLOSED} に「{key_of(section)}」で始まる節が複数あり判別できません", file=sys.stderr)
        sys.exit(1)
if target is None:
    print(f"移動先 {CLOSED} に「{section}」に対応する節が見つかりません", file=sys.stderr)
    sys.exit(1)

# その節のテーブルの最終行を探し、その直後へ挿入する（節見出しとの区切り空行の下に入れない）
insert_at = None
for i in range(target + 1, len(closed)):
    if closed[i].startswith("## "):
        break
    if closed[i].startswith("|"):
        insert_at = i + 1
if insert_at is None:
    print(f"移動先の節「{section}」にテーブルが見つかりません", file=sys.stderr)
    sys.exit(1)

closed.insert(insert_at, row)
del live[idx]

open(LIVE, "w", encoding="utf-8").write("\n".join(live))
open(CLOSED, "w", encoding="utf-8").write("\n".join(closed))

print(f"{entry_id} を「{section}」から {CLOSED} の同名節へ移しました（{insert_at + 1} 行目）")
if new_status is not None:
    print("状態列を差し替えました")
print("npm run ledger:check で構造を確認してください")
PY
