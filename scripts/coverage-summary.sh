#!/bin/sh
# カバレッジの計測結果を markdown の表に整形して標準出力へ書く（T-38）。
#
# 使い方:
#   npm run test:coverage        # coverage/coverage-summary.json を生成
#   npm run coverage:summary     # それを読んで markdown を出力
#
# CI はこの出力を PR コメントとジョブサマリの両方へ流す（.github/workflows/ci.yml）。
# ファイル単位ではなくディレクトリ単位に集計するのは、全体値だけでは
# 「domain は高く app は意図的に低い」という実態が読めないため（アーキテクチャ定義書 §8）。
set -eu

cd "$(git rev-parse --show-toplevel)"

exec python3 - "$@" <<'PY'
import json
import os
import sys

SUMMARY = "coverage/coverage-summary.json"
# text/text-summary と並ぶ json-summary reporter の出力（vitest.config.ts）
if not os.path.exists(SUMMARY):
    sys.exit(f"{SUMMARY} がありません。先に npm run test:coverage を実行してください")

with open(SUMMARY, encoding="utf-8") as f:
    data = json.load(f)

# json-summary はファイルのキーを絶対パスで持つため、表示用に repo ルートを落とす
root = os.getcwd() + os.sep
METRICS = ("statements", "branches", "functions", "lines")

dirs = {}
for key, value in data.items():
    if key == "total":
        continue
    rel = key[len(root):] if key.startswith(root) else key
    acc = dirs.setdefault(os.path.dirname(rel), {m: {"covered": 0, "total": 0} for m in METRICS})
    for m in METRICS:
        acc[m]["covered"] += value[m]["covered"]
        acc[m]["total"] += value[m]["total"]


def pct(entry):
    # 計測対象の文がない層（total=0）は 0% と区別する
    if entry["total"] == 0:
        return "-"
    return f"{entry['covered'] * 100 / entry['total']:.1f}"


out = [
    # CI が既存コメントを見つけて更新するための目印。消すとコメントが毎回増える
    "<!-- coverage-summary -->",
    "## テストカバレッジ",
    "",
    "| 層 | Stmts | Branch | Funcs | Lines |",
    "|---|---:|---:|---:|---:|",
]
for label, entry in [("**全体**", data["total"])] + [(f"`{d}`", dirs[d]) for d in sorted(dirs)]:
    out.append(f"| {label} | " + " | ".join(pct(entry[m]) for m in METRICS) + " |")

out += [
    "",
    "数値ゲートを設けない補助指標（アーキテクチャ定義書 §8）。"
    "presentation は自動テストの対象外で手動確認が担保するため、"
    "`src/app` 配下（Server Actions・hooks）と `proxy.ts` は 0% が並ぶ。"
    "**全体値ではなく層ごとの数字で読む**（`.tsx` は計測対象に含めていない）。",
]
print("\n".join(out))
PY
