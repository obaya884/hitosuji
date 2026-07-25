#!/bin/sh
# カバレッジの計測結果を markdown の表に整形して標準出力へ書く（T-38）。
#
# 使い方:
#   npm run test:coverage        # coverage/coverage-summary.json を生成
#   npm run coverage:summary     # それを読んで markdown を出力
#
# CI はこの出力を PR コメントとジョブサマリの両方へ流す（.github/workflows/ci.yml）。
# ファイル単位ではなく層単位に集計するのは、全体値だけでは
# 「domain は高く app は意図的に低い」という実態が読めないため（アーキテクチャ定義書 §8）。
set -eu

cd "$(git rev-parse --show-toplevel)"

exec python3 - <<'PY'
import json
import os
import sys

# text/text-summary と並ぶ json-summary reporter の出力（vitest.config.ts）
SUMMARY = "coverage/coverage-summary.json"
# 集計の粒度。src 直下2階層（src/domain・src/usecases・src/infrastructure・src/app）＝
# アーキテクチャ定義書 §2 の依存方向の層に合わせる。末端ディレクトリまで割ると
# 1ファイルだけの行が並び、肝心の層ごとの数字を読む側が足し合わせる必要が出る
LAYER_DEPTH = 2
METRICS = ("statements", "branches", "functions", "lines")
# CI が既存コメントを見つけて更新するための目印（ci.yml は本文1行目をそのまま使う）。
# 消すとコメントが実行ごとに増える
MARKER = "<!-- coverage-summary -->"
# 数字の読み方だけを添える。方針そのものはアーキテクチャ定義書 §8 が正
NOTE = (
    "数値ゲートを設けない補助指標。**全体値ではなく層ごとの数字で読む**"
    "——`src/app`（Server Actions・hooks）と `src`（`proxy.ts`）が低いのは "
    "presentation を自動テストの対象外に置いた結果で、テストが薄いわけではない"
    "（アーキテクチャ定義書 §8）。"
)

if not os.path.exists(SUMMARY):
    sys.exit(f"{SUMMARY} がありません。先に npm run test:coverage を実行してください")

with open(SUMMARY, encoding="utf-8") as f:
    data = json.load(f)

# json-summary はファイルのキーを絶対パスで持つため、表示用に repo ルートを落とす
root = os.getcwd() + os.sep


def layer_of(key):
    rel = key[len(root):] if key.startswith(root) else key
    # ルート直下のファイル（現状の include では出ないが、広げたときに空ラベルにしない）
    return "/".join(os.path.dirname(rel).split("/")[:LAYER_DEPTH]) or "."


def pct(entry):
    # 計測対象の文がない層（型定義だけの ports など）は 0% と区別する
    if entry["total"] == 0:
        return "-"
    return f"{entry['covered'] * 100 / entry['total']:.1f}"


layers = {}
for key, value in data.items():
    if key == "total":
        continue
    acc = layers.setdefault(layer_of(key), {m: {"covered": 0, "total": 0} for m in METRICS})
    for m in METRICS:
        acc[m]["covered"] += value[m]["covered"]
        acc[m]["total"] += value[m]["total"]

out = [
    MARKER,
    "## テストカバレッジ",
    "",
    "| 層 | % Stmts | % Branch | % Funcs | % Lines |",
    "|---|---:|---:|---:|---:|",
]
rows = [("**全体**", data["total"])] + [(f"`{name}`", layers[name]) for name in sorted(layers)]
for label, entry in rows:
    out.append(f"| {label} | " + " | ".join(pct(entry[m]) for m in METRICS) + " |")
out += ["", NOTE]

print("\n".join(out))
PY
