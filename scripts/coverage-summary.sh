#!/bin/sh
# カバレッジの計測結果を markdown の表に整形して標準出力へ書く（T-38）。
#
# 使い方:
#   npm run test:coverage                 # coverage/ 配下のレポートを生成
#   npm run coverage:summary              # それを読んで markdown を出力
#   npm run coverage:summary -- <base>    # <base>...HEAD の変更箇所カバレッジも添える
#
# CI はこの出力を PR コメントとジョブサマリの両方へ流す（.github/workflows/ci.yml）。
# ファイル単位ではなく層単位に集計するのは、全体値だけでは
# 「domain は高く app は意図的に低い」という実態が読めないため（テスト戦略定義書 §7）。
set -eu

# 素の `cd "$(git rev-parse --show-toplevel)"` はリポジトリ外で空文字列の cd になり、
# 失敗扱いにならないままカレントディレクトリで走り出す（読めない理由で落ちて原因が分かりにくい）
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "hitosuji リポジトリの中で実行してください" >&2
  exit 1
}
cd "$repo_root"

exec python3 - "$@" <<'PY'
import json
import math
import os
import re
import subprocess
import sys

# text/text-summary と並ぶ json-summary reporter の出力（vitest.config.mts）
SUMMARY = "coverage/coverage-summary.json"
# 行ごとの実行回数。変更箇所カバレッジの判定に使う
LCOV = "coverage/lcov.info"
# 集計の粒度。src 直下2階層（src/domain・src/usecases・src/infrastructure・src/app）＝
# アーキテクチャ定義書 §2 のレイヤー構成に合わせる。末端ディレクトリまで割ると
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
    "| 📁 | % Stmts | % Branch | % Funcs | % Lines |",
    "|---|---:|---:|---:|---:|",
]
for name in sorted(layers):
    out.append(f"| `{name}` | " + " | ".join(pct(layers[name][m]) for m in METRICS) + " |")


def changed_lines(base):
    """base...HEAD で追加・変更された行を {パス: {行番号}} で返す。"""
    diff = subprocess.run(
        ["git", "diff", "--unified=0", "--diff-filter=d", f"{base}...HEAD"],
        capture_output=True,
        text=True,
    )
    if diff.returncode != 0:
        return None
    changed, path = {}, None
    for line in diff.stdout.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:]
        elif line.startswith("@@") and path:
            # @@ -12,3 +14,5 @@ の "+14,5"。件数の既定は1、0 なら削除だけのハンク
            start, _, count = re.search(r"\+(\d+)(,(\d+))?", line).group(1, 2, 3)
            count = int(count) if count else 1
            changed.setdefault(path, set()).update(range(int(start), int(start) + count))
    return changed


def measured_lines():
    """lcov から {パス: {行番号: 実行回数}} を読む。"""
    measured, path = {}, None
    with open(LCOV, encoding="utf-8") as f:
        for line in f:
            if line.startswith("SF:"):
                path = line[3:].strip()
            elif line.startswith("DA:") and path:
                lineno, hits = line[3:].strip().split(",")
                measured.setdefault(path, {})[int(lineno)] = int(hits)
    return measured


def as_ranges(numbers):
    """[45, 47, 48, 49] を "45, 47-49" に畳む。"""
    spans = []
    for n in sorted(numbers):
        if spans and n == spans[-1][1] + 1:
            spans[-1][1] = n
        else:
            spans.append([n, n])
    return ", ".join(str(a) if a == b else f"{a}-{b}" for a, b in spans)


# 変更箇所カバレッジ（base が渡されたとき＝CI では PR のときだけ）。
# 「変更した行のうち計測対象の行」を分母にする——空行・コメント・型宣言には
# lcov の DA が無く、分母から自然に落ちる
base = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
if base and os.path.exists(LCOV):
    out += ["", "**変更箇所のカバレッジ**", ""]
    changed = changed_lines(base)
    if changed is None:
        out.append(f"`{base}` との差分を取得できなかったため判定していません。")
    else:
        measured = measured_lines()
        rows, hit_total, line_total = [], 0, 0
        for path in sorted(changed):
            lines = {n: measured[path][n] for n in changed[path] if n in measured.get(path, {})}
            if not lines:
                continue
            uncovered = [n for n, hits in lines.items() if hits == 0]
            hit_total += len(lines) - len(uncovered)
            line_total += len(lines)
            rows.append(f"| `{path}` | {len(lines) - len(uncovered)}/{len(lines)} | "
                        f"{as_ranges(uncovered) if uncovered else '-'} |")
        if rows:
            ratio = pct({"covered": hit_total, "total": line_total})
            out += [
                f"変更した行のうち計測対象は {line_total} 行、うち実行されたのは "
                f"{hit_total} 行（{ratio}%）。",
                "",
                "| ファイル | カバー | 未カバーの行 |",
                "|---|---:|---|",
            ] + rows
        else:
            # docs・scripts・設定だけの変更ではここに来る（計測対象は src 配下のみ）
            out.append("変更行に計測対象（`src/**/*.{ts,tsx}`）はありません。")

print("\n".join(out))
PY
