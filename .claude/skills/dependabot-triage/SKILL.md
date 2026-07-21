---
name: dependabot-triage
description: >-
  依存パッケージの更新をどうするか判断したいときに使う。GitHub の Dependabot が上げた
  bump PR（あるライブラリを X から Y に上げる、eslint/typescript/esbuild/postcss/drizzle-kit/@types/node
  等の major/minor/patch）を「マージするか・閉じるか」、CIが赤い/緑だがどう扱うか、複数の更新PRの
  どれを入れどれを閉じるか、を決めたい場面はすべてこれ。あわせて GitHub Security の脆弱性アラートを
  「dismiss するか・overrides で直すか」迷う場面も含む。「dependabot」「bump」「脆弱性」「アラート」の語が
  無くても、パッケージ名や version 番号が絡む更新・セキュリティ判断ならこれを使う。「このPR見て」でも中身が
  依存更新なら使う。使わない場面: 自作コードのレビュー、機能実装、CI設定やビルド高速化、デプロイ手順、gh CLI の使い方。
  merge＝本番デプロイの規律を守り、close/merge/dismiss を安全に進める。
---

# Dependabot トリアージ（hitosuji）

Dependabot の依存更新PR・セキュリティアラートを、機械的検証（CI）と最小限の人手で
さばくためのワークフロー。**判断基準を持つこと**が肝で、「CIが緑だから全部マージ」でも
「怖いから全部放置」でもない、根拠のある取捨選択をする。

## 最優先の規律（絶対に飛ばさない）

- **マージ＝main への push＝本番デプロイ**。CI が緑でも、マージは**オーナーの明示的な合図を待つ**。自分の判断で merge/deploy しない
- **アラートの dismiss もアウトバウンド操作**。実行前にオーナーに一声かける
- **close は実行してよい**（差し戻しではなく、後述の理由付きクローズ）
- 挙動を変えない依存追随・ツール整備は `docs/技術改善計画.md` に **T-XX** で記録する（[CLAUDE.md](../../../CLAUDE.md) の軸分け）

## 手順

### 1. 棚卸し

```bash
gh pr list --repo obaya884/hitosuji --state open --json number,title,headRefName,labels
gh api repos/obaya884/hitosuji/dependabot/alerts --jq '.[] | select(.state=="open") | {num:.number, sev:.security_advisory.severity, pkg:.dependency.package.name, scope:.dependency.scope, range:.security_vulnerability.vulnerable_version_range, patched:.security_vulnerability.first_patched_version.identifier}'
```

version-update PR と security アラートは別物。両方を見る。

### 2. 各PRの事実を集める

- **版差分**（major / minor / patch）— タイトルの `from X to Y` から読む
- **CI が何をカバーするか**を必ず意識する。このリポの CI（`.github/workflows/ci.yml`）は `lint`・`build`・`test` を回す。ただし歴史的に「Vercel ビルドだけ」だった時期があり、**その PR の実際のチェック**を見る:

```bash
gh pr checks <PR> --repo obaya884/hitosuji
```

`verify` ジョブ（GitHub Actions CI）が緑なら lint/build/test 済み。Vercel だけの緑は**型チェック込みビルドのみ**で lint/test は未検証、と解釈する。

### 3. 取捨選択（判断ルール）

考え方の核心は「**CI の緑が何を保証しているか**」と「**版差分が壊す確率**」。

- **patch / minor（グループPR含む）で CI 緑** → マージ候補。CI が lint/test まで回していれば追加検証は薄くてよい。回していないなら §4 のローカル検証をしてからオーナーに諮る
- **major bump** → 破壊的変更・エコシステムの追随遅れを疑う:
  - CI の build が**落ちている** → 素の破壊的変更（例: TypeScript 5→7 のネイティブ移植）。**close**
  - CI は緑だが **CI がその変更を検証していない** → ローカルで該当チェックを回す。例: eslint 9→10 は `next build` では eslint を実行しないため緑に見えるが、`npm run lint` を回すと `eslint-config-next` 同梱プラグインが未対応でクラッシュする、といった落とし穴がある（§4）
- **`@types/*` / ランタイム連動**（`@types/node` 等） → **ランタイムのメジャーに合わせる**。最新へ追い越さない（本番 Vercel の Node ランタイムに揃える。types だけ先行すると、実在しない API を型が許してしまう）
- 迷ったら「**今マージして本番に出して安心か**」を基準に、close か verify-then-ask に振る

### 4. major/dev 依存のローカル検証（CI が見ない部分）

CI が検証しない領域（lint、drizzle-kit のマイグレーション等）は、その PR ブランチで実際に動かして確かめる。**作業ツリーに別件の未コミット変更があるなら先に退避**（後述）。

```bash
git fetch origin <branch> && git checkout <branch> && npm ci
npm run lint      # eslint 系の major はここが本番
npm run build
npm test          # 統合テストは db-test(:5433) が要る
```

一区切りの機械検証は `verifier` サブエージェントに委譲してよい（このリポの実装完了フローと同じ）。

### 5. 実行

**close（後で見失わないための「普通のクローズ」）**

```bash
gh pr close <PR> --repo obaya884/hitosuji --comment "<日本語で理由。5系維持 等>"
```

- **`@dependabot ignore ...` コマンドは使わない**。普通のクローズなら同じ版は再作成されないが、**より新しい版が出れば新規PRで再浮上**する（見失わない）。`ignore this major version` / `ignore this dependency` は将来の通知まで止めてしまうので、明示的にそうしたい時だけ
- close の `--comment` は人間向けメモで、抑止効果はない

**merge（オーナー合図後のみ。＝本番デプロイ）**

```bash
gh pr merge <PR> --repo obaya884/hitosuji --squash --delete-branch
git checkout main && git pull        # remote に追随
npm ci                                # マージ後の lockfile に依存を合わせ直す
```

- 合図が出るまではマージしない。複数PRを取り込むなら「先に全部ローカル検証 → まとめて合図をもらう」と本番デプロイ回数を絞れる
- 挙動を変えない更新なら `docs/技術改善計画.md` に完了記録として T-XX を残す

### 6. セキュリティアラート

アラートは「**到達可能性**」と「**上流にクリーンな修正があるか**」で対処が変わる。

1. transitive か直接依存か、dev か runtime scope か、**脆弱コードが実行経路に乗るか**を見る
2. **overrides で安全に直せる** → `package.json` の `overrides` で修正版に固定し `npm install`。CI の build で回帰なしを確認してからオーナーに諮る（例: `postcss` を `^8.5.10` に固定して Next 同梱の古い版を dedupe）
3. **上流に修正が無く、脆弱経路が到達不能** → 理由付きで **dismiss**（オーナー合図後）:

```bash
gh api --method PATCH /repos/obaya884/hitosuji/dependabot/alerts/<N> \
  -f state=dismissed -f dismissed_reason=not_used \
  -f dismissed_comment="<到達不能である根拠と、根治条件（上流の対応待ち 等）>"
```

- `dismissed_reason` は `not_used`（脆弱コード未使用）/ `tolerable_risk`（許容）/ `inaccurate` 等から実態に合うものを選ぶ
- **CI で検出できない壊し方をする override は避ける**（例: `@esbuild-kit` が古い esbuild を前提とする場合、esbuild を上げると `drizzle-kit generate/migrate` が壊れるが CI は気づけない → override せず dismiss＋追跡）
- dismiss したものは `docs/技術改善計画.md` に T-XX で追跡（根治条件と再確認のトリガーを書く）

## 別件 WIP を混ぜない

トリアージのために別ブランチへ切り替える前に、作業ツリーの未コミット変更を確認する。無関係な WIP があれば `git stash` で退避するか、コミットは**対象ファイルだけを個別に `git add`** して混入を防ぐ。トリアージのコミットに別件の変更を巻き込まない。

## 完了の確認

- version-update PR: 想定どおり残 open が減っている（`gh pr list`）
- security: `gh api .../dependabot/alerts` の open が想定数（修正版は自動クローズ、dismiss は dismissed 表示）
- マージした変更は main の CI が緑、本番デプロイが Ready

## 参考
- 判断の軸分け・本番デプロイ規律: [CLAUDE.md](../../../CLAUDE.md)
- 技術活動の台帳: [docs/技術改善計画.md](../../../docs/技術改善計画.md)
