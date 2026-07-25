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
import math
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
    # istanbul（vitest の text / text-summary reporter）と同じ切り捨て。
    # 四捨五入すると手元の出力と 1/100 ずれて、同じ数字なのか判断できなくなる
    return f"{math.floor(entry['covered'] * 10000 / entry['total']) / 100:.2f}"


layers = {}
for key, value in data.items():
    if key == "total":
        continue
    acc = layers.setdefault(layer_of(key), {m: {"covered": 0, "total": 0} for m in METRICS})
    for m in METRICS:
        acc[m]["covered"] += value[m]["covered"]
        acc[m]["total"] += value[m]["total"]

out = [MARKER, "## テストカバレッジ", ""]

# 全体値は分母つきで出す（vitest の text-summary reporter と同じ見出し・見た目・桁数）。
# 表の側は層の比較が目的なので割合だけに絞る
out += ["**Coverage summary**", "", "```"]
for metric in METRICS:
    entry = data["total"][metric]
    out.append(f"{metric.capitalize():<13}: {pct(entry)}% ( {entry['covered']}/{entry['total']} )")
out += ["```", ""]

out += [
    "| 層 | % Stmts | % Branch | % Funcs | % Lines |",
    "|---|---:|---:|---:|---:|",
]
for name in sorted(layers):
    out.append(f"| `{name}` | " + " | ".join(pct(layers[name][m]) for m in METRICS) + " |")

print("\n".join(out))
PY
