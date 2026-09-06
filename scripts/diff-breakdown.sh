#!/bin/sh
# PR の変更行数を4区分（docs / src 本体 / src テスト / その他）へ振り分けて
# markdown の表に整形し、標準出力へ書く（T-126）。
#
# 使い方:
#   sh scripts/diff-breakdown.sh <base>   # <base>...HEAD の差分を集計
#
# CI はこの出力をカバレッジ表（scripts/coverage-summary.sh）の後ろへ足して、
# 1つの PR コメントとして投稿する（.github/workflows/ci.yml）。
# 合計ではなく4区分に割るのは、docs 先行の運用だと PR の変更行数の大半が docs になり、
# テストは src へコロケーションされる（テスト戦略定義書 §4）ため。
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
import subprocess
import sys

# 表もこの順で出す
DOCS = "docs"
SRC_MAIN = "src（本体）"
SRC_TEST = "src（テスト）"
OTHER = "その他"
CATEGORIES = (DOCS, SRC_MAIN, SRC_TEST, OTHER)


def category_of(path):
    segments = path.split("/")
    if segments[0] == "docs" or (len(segments) == 1 and path.endswith(".md")):
        # docs/ 配下と、リポジトリ直下の md（CLAUDE.md・README.md・AGENTS.md）
        return DOCS
    if segments[0] == "src":
        # テスト本体（*.test.ts / *.test.tsx / *.int.test.ts / *.browser.test.tsx）と、
        # テストからしか使わないヘルパーの置き場（テスト戦略定義書 §4）。
        # ヘルパーは src/app 配下が `_testing/`、それ以外の層が `testing/` と綴りが割れるので
        # 両方を見る（vitest.config.mts の coverage.exclude と同じ対象）
        if ".test." in segments[-1] or any(s in ("testing", "_testing") for s in segments[:-1]):
            return SRC_TEST
        return SRC_MAIN
    return OTHER


base = sys.argv[1] if len(sys.argv) > 1 else ""
if not base:
    # push（main）には「変更箇所」の基準がないので何も出さない。CI は出力を追記するだけなので、
    # ここが空なら表そのものが付かない
    sys.exit(0)

# -z を使うのは、docs 配下に日本語・空白を含むファイル名が多く、既定の出力だと
# クォートと \344 形式のエスケープが混ざって素朴な分割が壊れるため
diff = subprocess.run(
    ["git", "diff", "--numstat", "-z", f"{base}...HEAD"],
    capture_output=True,
    text=True,
)

# CI は 40 桁の SHA を渡すので短縮して見せる（手元から `main` 等を渡したときはそのまま）
label = base[:7] if re.fullmatch(r"[0-9a-f]{40}", base) else base

# 先頭の空行は、ci.yml がカバレッジ表へ >> で追記するときの区切り（markdown は見出しの前に空行が要る）
out = ["", "## 変更行数の内訳", ""]
if diff.returncode != 0:
    # コメント側は「出せなかった」で足りるが、原因（fetch 深度・base の消失）はジョブログに残す
    print(diff.stderr, file=sys.stderr, end="")
    print("\n".join(out + [f"`{label}` との差分を取得できなかったため集計していません。"]))
    sys.exit(0)

totals = {name: {"added": 0, "deleted": 0} for name in CATEGORIES}

# --numstat -z の1件は "追加\t削除\tパス\0"。リネーム・コピーだけはパスが空になり、
# 続く2トークンが旧パス・新パスとして並ぶ
tokens = diff.stdout.split("\0")
i = 0
while i < len(tokens):
    record = tokens[i]
    i += 1
    if not record:
        continue
    added, deleted, path = record.split("\t", 2)
    if not path:
        # この時点で i は旧パスを指す。区分は新パス側で決める
        _old_path, path = tokens[i], tokens[i + 1]
        i += 2
    entry = totals[category_of(path)]
    # バイナリは "-" で来る。行数を持たないので 0 のまま足す
    entry["added"] += int(added) if added != "-" else 0
    entry["deleted"] += int(deleted) if deleted != "-" else 0

out += [
    f"`{label}...HEAD` の差分。",
    "",
    "| 区分 | 追加 | 削除 |",
    "|---|---:|---:|",
]
# 0 行の区分も行として残す——「今回 src は動いていない」こと自体がこの表の答えだから
for name in CATEGORIES:
    out.append(f"| {name} | +{totals[name]['added']} | -{totals[name]['deleted']} |")
added_all = sum(t["added"] for t in totals.values())
deleted_all = sum(t["deleted"] for t in totals.values())
out.append(f"| **合計** | **+{added_all}** | **-{deleted_all}** |")

print("\n".join(out))
PY
