# 技術改善バックログ完了記録

- 作成日: 2026-07-24
- 目的: 完了した技術活動（T-XX）を原文のまま保管する。ライブ台帳は[技術改善バックログ](./23_技術改善バックログ.md)（未着手・進行中・保留のみを持つ）
- エントリは完了への状態更新と同じコミットで本書へ移す（並びは完了日の新しい順）。判断の経緯は従来どおり [log_23_技術改善バックログ.md](./log_23_技術改善バックログ.md) が持つ

## T-26 git/ブランチ戦略の全体設計（T-06 と統合・2026-07-25）

- 種別: 調査 → 対応 / 優先度: 中
- 背景: git/ブランチ運用に明文規定がなく、実態は `main` 直コミットと PR（#16/#27 等）が混在。`main` への push＝本番デプロイ（Vercel）という制約の下で、変更の種類ごとの扱いを一貫させたい。並行開発（複数 worktree）まで見据えると、マージ順序の調停・スキーマ変更の直列化を扱う T-06「AI並行開発体制」と不可分であり、両者を1つの設計として束ねる
- 対応: 設計を [34_git運用と並行開発体制検討.md](../検討/34_git運用と並行開発体制検討.md) §2「git 運用ルール」として確定（T-06 と統合して文書を改称）。(1) リスク別ルーティング＝docs・軽微は `main` 直コミット／コード・挙動はブランチ→PR→CI→オーナー合図でマージ／スキーマは migrate 先行（T-22）、(2) push・マージは常にオーナー合図（自動マージ・ブランチ保護なし＝T-01 方針の継承）、(3) 並行化の運用＝ブランチ命名 `<タスクID>-<slug>`（worktree ディレクトリ名・テストDB名と機械的に対応）・1ブランチ1PR・マージ後削除・スキーマ変更ブランチは常に最大1本・マージキューで逐次調停。CLAUDE.md に「git 運用」節を新設（要約＋参照）
- 結果: 挙動不変（docs・運用ルールのみ）。本ルールの初回実践として、実装自体を `t-26-git-strategy` ブランチ＋PR で実施。残置していたマージ済みリモートブランチ（`claude/*` 4本）はマージ後に削除
- 関連: 本書 T-06（並行開発体制。Phase 1〜2 を同時実施）/ 本書 T-01（CI 基盤）・T-22（本番スキーマ更新パイプライン）/ [CLAUDE.md](../../CLAUDE.md)「git 運用」

## T-19 Shift+J/K のアーカイブ済みセクション境界で楽観更新とサーバ確定がずれうる（2026-07-25）

- 種別: 調査 → 対応 / 優先度: 中
- 背景: T-11 のレビュー（spec-reviewer）で判明した既存の潜在論点。Shift+J/K の移動先算出で、サーバ `moveTaskByOneStep` の `sectionOrder` は `activeSections`（アーカイブ済み除外）だが、presentation `daily-board.tsx` は `optimisticGroups` 由来で当日タスクが属するアーカイブ済みセクションを含みうる。その境界を跨ぐ Shift+J/K で、client は移動先ありと楽観更新するがサーバは `indexOf === -1` で「動かさない」と判定し楽観更新が巻き戻る（データ不整合はなく視覚的な巻き戻りのみ・エッジケース）
- 調査結果: 再現条件（当日タスクを持つアーカイブ済みセクションの境界を跨ぐ Shift+J/K）と実害（視覚的巻き戻りのみ・sort_order は常に妥当でデータ不整合なし）を確定。ローカルでの間欠再現は不要な範囲だが、コード追跡で client/server の `sectionOrder` 定義差を実害の原因と特定
- オーナー判断: 「表示されているものは跨げる」＝当日タスク付きアーカイブ済みセクションも Shift+J/K の移動先に含める（O-5 の割り当てがアーカイブ済みを除外するのとは役割が異なる）。docs 先行で画面定義書01 O-6 を更新（`log_01_デイリーリスト.md` に決定エントリ）
- 対応: 移動先セクション順を表示順に統一。`src/domain/task/daily-list.ts` に `displaySectionOrder(tasks, sections)`（＝`groupTasksBySection` の表示順から ID 列を作る純関数）を追加し、`moveTaskByOneStep`（サーバ）がこれを使用（従来の `activeSections` 版を置換）。presentation は同じ規則を `optimisticGroups` から再現。両者とも `groupTasksBySection` に由来し定義の二重実装が解消
- 結果: 挙動変更（アーカイブ済み境界を跨げるようになった）。docs 反映済み。lint / build / 全テスト（unit 570・int 49）緑。domain・usecases に O-6/T-19 テストを追加（混在ソートの挿入位置・跨ぎの両方向・リスト端 no-move を含む）
- 関連: [完了記録](./closed_23_技術改善バックログ.md) T-11（移動先算出の domain 一本化）/ 画面定義書01 O-6

## T-30 `@types/node` を本番ランタイム（Node 24 系）へ追随させる（2026-07-25）

- 種別: 負債返済 / 優先度: 中
- 背景: `package.json` が `@types/node: ^20` のままで、本番 Vercel・CI・db-migrate のランタイム（Node 24 系）に型定義が追随していなかった。Dependabot PR #3（20 → 26）を「ランタイムを追い越すため見送り」でクローズした際に追随先の 24 へ上げる作業が残り、Dependabot は最新版（26）しか PR にしないため放置では埋まらない状態だった（[アーキテクチャ定義書](../仕様/15_アーキテクチャ定義書.md) §11）
- 対応: `@types/node` を `^24` に上げ `npm install`（2パッケージ更新）。lint / build / 全テスト（46ファイル・610件）で回帰なしを確認。メジャー4つ分の型更新だが型エラーは発生しなかった
- 結果: 挙動不変（型定義のみ）。本番ランタイムと型定義のメジャーが一致
- 関連: [アーキテクチャ定義書](../仕様/15_アーキテクチャ定義書.md) §11（版の追随関係は同節が正）

## T-20 `npm run test:coverage` の `.tmp` 削除競合で Unhandled Rejection（2026-07-25）

- 種別: 負債返済 / 優先度: 様子見
- 背景: T-11/T-12 の検証（verifier）で判明した設定負債。`test:coverage` が unit と integration の2プロジェクトを同一 `coverage.reportsDirectory` で並行実行し、片方のクリーンアップがもう片方の `coverage/.tmp` を削除する競合で `ENOENT`（Unhandled Rejection）がログに出た。exit code は 0 で CI は成功扱いだがログにエラーが残る。vitest 4.1.10（最新4系）は upstream 修正（[PR #9378](https://github.com/vitest-dev/vitest/pull/9378)）未取り込みのため設定側で対処
- 対応: `test:coverage` スクリプトに `--no-file-parallelism` を付与（`vitest run --coverage --no-file-parallelism`）。全ファイルを直列実行することで共有 `coverage/.tmp` への並行アクセス自体が構造的に消える。バックログが挙げた2案（出力先のプロジェクト分離／逐次2回run）はいずれも合算カバレッジ像を失う（分離＝2レポートに割れて誤読を招く／逐次＝後のrunが前を上書き）ため採らず、単一の合算レポートを保てる本方式を選んだ。coverage は随時実行の補助指標で `test:unit`/`test:int`/`watch` は無影響
- 結果: 挙動（プロダクト）不変。`test:coverage` は exit 0・610件成功・合算レポート維持（Statements 71.78%）・ENOENT なしを確認（所要 ~11.7s）。※元の競合はローカルで再現しなかったため「失敗ケースの消失」実証はできていないが、直列化で競合の発生条件（並行アクセス）自体を除去した
- 関連: [完了記録](./closed_23_技術改善バックログ.md) T-17（カバレッジ導入）

## T-28 docs 全文書への一意採番の導入（2026-07-24）

- 種別: 改善（docs 構造）/ 優先度: 中
- 背景: T-27 の台帳分離に続く docs 構造の整備。文書ファイルに順序・識別の番号がなく（画面定義書 00〜04 のみ採番済み）、一覧性と参照の安定性に欠けていた
- 対応: **docs 全体で一意な2桁ブロック採番**を導入（0X=画面定義書内〔現状維持〕/ 1X=仕様 / 2X=案件 / 3X=検討）。並びは仕様=FB着手の判定順（11 要求 → 12 要件 → 13 画面 → 14 データモデル → 15 アーキテクチャ）、案件=流入順（21 FB → 22 要件BL → 23 技術改善BL → 24 実装計画）、検討=作成順（31 バンドル → 32 スキーマ更新 → 33 バックアップ → 34 AI並行開発）。`log_` / `closed_` / `guide_` は親の番号を引き継ぐ。全19ファイル/ディレクトリを `git mv` し、docs・README・CLAUDE.md・`.claude/`（agents 4本・dependabot-triage）の参照を全追随。体系は CLAUDE.md「最重要ルール」に明文化
- 結果: 挙動不変（docs・エージェント定義のみ）。文中の「画面定義書01」呼称・H1 タイトル・FB/T/F/N の ID は不変。git は全ファイルを rename として認識し履歴が連続
- 関連: 本書 T-27（台帳分離）/ [CLAUDE.md](../../CLAUDE.md)「最重要ルール」

## T-27 案件台帳の完了分をアーカイブへ分離（2026-07-24）

- 種別: 改善（docs 構造）/ 優先度: 中
- 背景: ユーザーフィードバック管理簿（43件中38件が対応済み）と技術改善バックログ（26件中18件が完了）は完了エントリが本文に線形蓄積する構造で、AI が起票・着手のたびに開くファイルなのに、ライブに読みたい未完了分が完了分のノイズに埋もれていた
- 対応: 既存の「ライブ台帳 vs 完了アーカイブ」パターン（要件バックログ／実装計画）を両台帳へ適用。`closed_<文書名>.md` を隣接新設して完了エントリを**原文のまま**移し、ライブ台帳は未完了のみに（FB管理簿の着手手順も `guide_21_ユーザーフィードバック.md` へ分離）。「完了・対応済みへの状態更新と同じコミットでアーカイブへ移す」を運用ルール・CLAUDE.md に明文化
- 結果: 挙動不変（docs のみ）。FB-XX / T-XX の番号・記述は温存し、完了 T を名指しする既存リンクは本書へ付け替え
- 関連: [ユーザーフィードバック管理簿](./21_ユーザーフィードバック.md) / [要件バックログ](./22_要件バックログ.md) / [CLAUDE.md](../../CLAUDE.md)「書き方の規約」

## T-22 本番スキーマ更新をリモートで実行するワークフロー（案A 採用・2026-07-23）

- 種別: ツール整備（当初は調査）/ 優先度: 中
- 背景: 本番マイグレーションは手元での手動実行だった（[CLAUDE.md](../../CLAUDE.md)「本番マイグレーションの手順」）。これをリモート（GitHub Actions）で完結させ、接続情報を Environment シークレットに置きたかった
- 方式判断: 実現方式 A（実行のリモート化・`workflow_dispatch`）→ B（マージ契機の自動 migrate→deploy）→ C（expand/contract）のうち、**個人開発の規模では A で必要十分**と判断し A を採用。B・C は過剰につき見送り（将来の two-way door として検討ドキュメント §3 に記録）。難所は migrate 実行そのものではなく (1) Vercel 自動デプロイとの順序保証、(2) public リポジトリでのシークレット露出、の2点。**詳細は [32_スキーマ更新パイプライン検討.md](../検討/32_スキーマ更新パイプライン検討.md) が正**
- 対応: ①`.github/workflows/db-migrate.yml`（`workflow_dispatch` ＋ migrate 専用 `db-migrate` Environment の承認ゲートで `npm run db:migrate`。新規マイグレーションを持つ PR ブランチから実行 → 成功後マージ＝デプロイ。Vercel の "Production" 環境とは分離）②`label-schema-migration.yml` を拡張し、スキーマ更新 PR に migrate 実行を促す注意コメント（`[!WARNING]`＋Run workflow 直リンク＋ブランチ名＋`gh` コマンド、sticky upsert）③README・CLAUDE.md を整理（手順は README が正・重複解消）
- 結果: 実働確認済み。PR #16（F-116・マイグレーション 0002）で「ラベル → 注意コメント → リモート migrate（`db-migrate` 承認ゲート経由で本番へ 0002 適用）→ マージ（＝デプロイ）」を通しで確認。挙動（プロダクト）不変
- 関連: 本書 T-01（CI 基盤）/ T-21（スキーマ更新ラベル）/ [CLAUDE.md](../../CLAUDE.md)「本番マイグレーションの手順」

## T-24 CI ワークフローの GITHUB_TOKEN を最小権限に絞る（2026-07-23）

- 種別: ツール整備 / 優先度: 中
- 背景: CodeQL（GitHub default setup）の code-scanning アラート（medium、`actions/missing-workflow-permissions`）。`.github/workflows/ci.yml` に `permissions:` ブロックが無く、GITHUB_TOKEN が既定の広い権限で発行されていた。verify ジョブは checkout と npm の lint/build/test のみで書き込み権限を要さない
- 対応: workflow レベルに `permissions: contents: read` を追加し、コード取得に必要な最小権限のみへ絞る。挙動（プロダクト・CI の検証内容）は不変。マージ後、default setup の再スキャンでアラートは自動クローズする
- 関連: 本書 T-01（CI 基盤）/ [.claude/skills/dependabot-triage](../../.claude/skills/dependabot-triage/SKILL.md) §7

## T-23 sharp（libvips 継承）の high 脆弱性を overrides で解消（2026-07-23）

- 種別: 負債返済 / 優先度: 中
- 背景: Dependabot セキュリティアラート（high、`sharp` <0.35.0）。上流 libvips 由来の脆弱性 4件（CVE-2026-33327 ほか、untrusted な GIF/TIFF/VIPS 画像のデコード時に影響）。`next@16.2.11` が transitive に同梱する `sharp@0.34.5` が原因。本アプリは `next/image`（`<Image>`）を使わず画像アップロード機能もないため sharp は実行経路に乗らず**到達不能**だが、上流に修正版（0.35.x）があるため dismiss ではなく根治を選んだ
- 対応: `package.json` の `overrides` で `sharp` を `^0.35.0` に固定。ツリーが `sharp@0.35.3`（libvips 8.18.3 同梱）へ dedupe され、アラートは修正版採用で自動クローズ。0.34→0.35 は minor（prebuilt バイナリ差し替えのみ）で API 破壊なし。CI の build で回帰なしを確認
- 関連: 本書 T-04（postcss overrides の同型対応）

## T-21 スキーマ更新が必要な PR に「スキーマ更新」ラベルを自動付与（2026-07-22）

- 種別: ツール整備 / 優先度: 中
- 背景: マージ＝本番デプロイであり、スキーマ変更を含む PR は**マージ前に本番マイグレーションを手動で流す**必要がある（[CLAUDE.md](../../CLAUDE.md)「本番マイグレーションの手順」）。この前提が PR 上で可視化されておらず、流し忘れがデプロイ事故につながりうる
- 対応: `.github/workflows/label-schema-migration.yml` を新設。`pull_request`（opened / synchronize / reopened）で PR 差分を見て、**新規追加**のマイグレーション（`src/infrastructure/db/migrations/*.sql`・`listFiles` の `status === 'added'`）を含む PR に「スキーマ更新」ラベルを付与し、含まなくなれば外す。`actions/github-script` でラベルの取得／生成／付与／除去を行う（ラベルは初回実行時に workflow が自動生成）
- 方針: 検出条件は**新規マイグレーション SQL の追加の有無に一本化**（`schema.ts` 変更のみでマイグレーション未生成のケースは別軸の課題として扱わない）。ラベルの付与・除去のみで、**CI は fail させず・マージもブロックしない**（T-01 の「検証のみ・手動マージ」方針と揃え、注意喚起に徹する）
- 結果: 挙動（プロダクト）不変。PR 上でスキーマ更新の要否が可視化され、本番マイグレーションの流し忘れを防ぐ注意喚起になる
- 関連: 本書 T-01（CI 基盤）/ [CLAUDE.md](../../CLAUDE.md)「本番マイグレーションの手順」

## T-09 マスタ表の Action ラッパとアーカイブ済みブロックを共通化（2026-07-22）

- 種別: 改善 / 優先度: 中
- 背景: modes/projects/sections の3表が、`run`（transition＋エラー表示）とアーカイブ済み `<details>` ブロック（復元／削除行）をほぼ同一構造で持っていた
- 対応: `useMasterAction`（`_lib/use-master-action.ts`＝`run`/`error`/`setError`/`isPending`。3表で完全一致だった）と `ArchivedMasterSection`（`_components/archived-master-section.tsx`。ラベル列は表ごとに違うため `renderCells` で受ける）を切り出し3表から使う。`commit`/`newRow` の骨格や各表固有のインライン編集（modes=カラーピッカー／sections=フィールド単位編集＋終了時刻導出）は差分として各表に残した
- 結果: 挙動不変。lint / build / test 緑

## T-10 ポップオーバーの「外側クリック＋Esc で閉じる」を共通フック化（2026-07-22）

- 種別: 改善 / 優先度: 中
- 背景: `mousedown` 外側クリック＋`keydown` Escape で閉じる同型の `useEffect` が5箇所（row-menu・select-popover・routinize-popover・modes-table の ColorPickerPopover・shortcut-help）に手書きコピーされていた
- 対応: `src/app/_lib/use-dismiss.ts` に `useDismiss(ref, onClose, { enabled, escape })` を新設（`use-flip-up` と同じ全画面共有 `_lib`）。ref=null で外側クリックを監視しない（shortcut-help＝スクリム側で処理）、`escape:false` で Escape を呼び出し側に残す（select-popover＝IME判定込みのキーナビと融合）、`enabled` で常時マウントの購読制御（row-menu）に対応
- 結果: 挙動不変（mousedown＋Escape）。lint / build / test 緑

## T-14 daily-board のキーボードショートカットをフックへ抽出（2026-07-22）

- 種別: 改善 / 優先度: 中
- 背景: `daily-board.tsx` 後半のグローバルショートカット処理（`useEffect` 約110行）が本体に埋め込まれ可読性を下げていた（挙動は画面定義書01 §6 が正）
- 対応: `use-daily-shortcuts.ts` の `useDailyShortcuts` フックへ抽出。状態・操作ハンドラを引数で受ける配線層で、依存配列を持たず毎レンダー登録し直して最新クロージャを拾う点も従来どおり
- 結果: 挙動不変。lint / build / test 緑

## T-16 生成物へ選択を移す非楽観パターンの共通化（2026-07-22）

- 種別: 改善 / 優先度: 低
- 背景: `daily-board.tsx` で「採番をサーバが決めるため楽観更新せず、成功で生成物の `createdId` へ選択移動・失敗で `setError`」という同型処理が複製・複製して開始・クイック追加の3箇所にあった
- 対応: `runSelectingCreated(action, optimistic?)` ヘルパーへ括り出し3箇所から使う。クイック追加は `optimistic` 引数で確定前の楽観 append を挟む。`operate` の "duplicate" 分岐を共有 transition から切り出し本ヘルパーへ寄せた
- 結果: 挙動不変。lint / build / test 緑

## T-11 Shift+J/K の移動先算出を domain 純関数へ一本化（2026-07-22）

- 種別: 負債返済 / 優先度: 中
- 背景: 選択タスクを1段動かす移動先（グループ内±1、端で隣セクションの先頭／末尾へ）の規則が、domain の `moveTaskByStep`（`reorder.ts`）と、楽観更新のため presentation の `moveByStep`（`daily-board.tsx`）に別実装で存在した（唯一のレイヤ責務違反）。片方だけ直すと楽観更新とサーバ確定がずれる
- 対応: 移動先だけを返す純関数 `stepMoveDestination(tasks, taskId, step, sectionOrder): { sectionId, index } | null` を `src/domain/task/reorder.ts` に切り出し、`moveTaskByStep` と `daily-board` の `moveByStep`（`orderedTasks`＋`optimisticGroups` 由来の sectionOrder を渡す）の双方が使う。移動しないときは `null`。`reorder.test.ts` に `stepMoveDestination` 直接のユニットを追加（端・空セクションまたぎ・未分類またぎ・不在）
- 結果: 挙動不変（同じ移動先を返す）。業務規則が domain 1箇所に集約。lint / build / test 緑

## T-12 `domain/routine/routine.ts` のコロケーションテストを補完（2026-07-22）

- 種別: 改善（テスト補強）/ 優先度: 様子見
- 背景: `describeRecurrence`・`toggleWeekday` は T-XX（PR #10 のテスト補完）で `routine.test.ts` に追加済みだったが、`weekdayBitOf`（日曜=0→月曜=0 のビット変換。off-by-one を起こしやすい）と `hasWeekday` の直接テストが無かった
- 対応: 既存 `src/domain/routine/routine.test.ts` に `weekdayBitOf`（月=bit0・日=bit6 の全曜日対応）と `hasWeekday`（月/日/複数曜日の該当判定、日曜 bit6 の off-by-one 確認）の直接テストを追記
- 結果: 挙動不変。対象4関数すべてに直接の仕様条項テストが揃った

## T-08 Server Action 結果型を共通型へ一本化（型のみ・2026-07-22）

- 種別: 改善 / 優先度: 中
- 背景: 構造が同一の結果型 `Readonly<{ ok: true } | { ok: false; message: string }>` が3箇所（daily `DailyActionResult`／routines `RoutineActionResult`／masters `ActionResult`）に別名で並立していた
- 対応: 正となる `ActionResult` を `src/app/_lib/action-result.ts` に新設し、3ファイルは再エクスポート/エイリアスに寄せた（`DailyActionResult = ActionResult` 等）。**型名は温存**したため消費側 `.tsx` は不変。**低リスクな型の一本化のみ先行**し、`revalidatePath` 込みの定型ラッパ化・`MESSAGES` 統合（文言差があり挙動＝表示変化になる）・`createdId`/carry-over 等の固有処理は据え置き（[アーキテクチャ定義書](../仕様/15_アーキテクチャ定義書.md) §1 の過剰抽象回避）
- 結果: 挙動不変。型定義が1箇所に集約。lint / build / test 緑

## T-17 カバレッジ計測（`@vitest/coverage-v8`）の導入を確認（2026-07-22）

- 種別: ツール整備 / 優先度: 中
- 背景: `test-reviewer` 導入に合わせカバレッジを数値で参照できるようにする項目
- 対応: `@vitest/coverage-v8`（devDependency）・`test:coverage` スクリプト・`vitest.config.ts` の `coverage` 設定（provider v8 / reporter text,text-summary / include・exclude）は既に対応方針どおり整備済みであることを確認。コード変更なし。`npm run test:coverage`（unit）で行/分岐カバレッジの実数値が出力されることを確認した（統合分は db-test 起動時に併走）
- 結果: **数値ゲートは設けない**方針は維持（§8 の主指標は「仕様条項に対応するテストがあるか」のまま、カバレッジは補助指標）

## T-18 draft から `NewTask` を組み立てる写経の共通化（2026-07-22）

- 種別: 改善 / 優先度: 低
- 背景: draft（`duplicateDraft`／`resumeTaskDraft` の戻り）から `NewTask` を1列ずつ写して組み立てるブロックが、`operations.ts`（`suspendTask`・`duplicateTask`・`duplicateAndStartTask` の newTask/resumeTask）と `punch-usecases.ts`（`startTask` の割り込み再開）で計5箇所に増殖していた（`sectionId`/`sortOrder`/`splitParentId` の供給元だけが違う）
- 対応: `src/usecases/task/from-draft.ts` に `newTaskFromDraft(draft, { taskDate, sectionId, sortOrder, splitParentId })` を新設し5箇所を置換。複製系は `splitParentId` を省略（＝null）、再開系は `draft.splitParentId` を渡す。ファイル名は §2 命名規約（ディレクトリ名 `task` を繰り返さない）に沿い `from-draft.ts` とした。`operations.ts` で不要になった `NewTask` の import を整理
- 結果: 挙動不変。フィールド対応は現状と1:1で、既存の `operations.test.ts`・`punch-usecases.test.ts` が緑

## T-07 統合テストの `updated_at` ミリ秒衝突フレークを解消（2026-07-22）

- 種別: 改善（テスト補強）/ 優先度: 様子見
- 背景: `drizzle-section-repository.int.test.ts`「update は名前と開始時刻を書き換え、updated_at を進める」が、更新の前後が同一ミリ秒に収まると `updatedAt` が変化せず `not.toBe` で偽陽性で落ちた。実装（アプリ層が `updated_at` を設定する契約）ではなくテスト側の時刻粒度の問題
- 対応: assertion を `not.toBe` → `toBeGreaterThanOrEqual`（巻き戻らない、または同値）に緩和。DB既定値（挿入時）とアプリ時刻（更新時）は同一クロックのため後退しないので `≧` で十分。テスト名を「updated_at を巻き戻さない」に、コメントも意図に整合させた
- 結果: 挙動不変。同一ミリ秒衝突でも偽陽性で落ちなくなった

## T-15 Dependabot 依存追随（next セキュリティ patch＋Actions v7）（2026-07-22）

- 種別: 依存追随 / 優先度: 中
- 背景: Dependabot の version-update PR 2件。#8 = npm minor-and-patch グループ（`next` 16.2.10→16.2.11・`react`/`react-dom` 19.2.7→19.2.8・`eslint-config-next` 16.2.10→16.2.11）。`next` 16.2.11 は DoS/SSRF/Middleware bypass 等の advisory を含むセキュリティ修正リリース。#7 = GitHub Actions グループ（`actions/checkout` v4→v7・`actions/setup-node` v4→v7、major）
- 対応: 両 PR とも `verify` ジョブ（lint/build/test）が緑を確認のうえ squash マージ。#7 の major 破壊的変更（fork PR の `pull_request_target` チェックアウト制限）は自リポの push/PR CI に無関係で、変更は `.github/workflows/ci.yml` のみ・本番ビルド内容に影響なし。ローカル main は rebase で追随、`npm ci` で lockfile 整合
- 結果: 挙動変更なし。オープン Dependabot PR 0件・セキュリティアラート 0件

## T-13 domain/usecases のファイル名を概念名へ統一（2026-07-22）

- 種別: 改善 / 優先度: 中
- 背景: ドメイン別ディレクトリに分けたうえで、ファイル名の命名規約が混在していた（`task/` に `task-edit.ts` と `punch.ts` が同居、`routine/` に `routine-order.ts` と `expansion.ts` が同居、各ドメインの `{obj}-usecases.ts` がディレクトリ名と重複）。新規追加のたびに「prefix を付けるか」を都度判断する揺れの元だった。オーナーの気づき（動詞単独ではドメインが読み取れない）を起点に対話で診断し、ディレクトリで文脈が付く前提で「オブジェクト名を繰り返さない」方向に倒すと決めた
- 対応: [アーキテクチャ定義書](../仕様/15_アーキテクチャ定義書.md) §2「ファイル命名規約」に明文化。ディレクトリ名と重複する prefix を外した（`task-edit.ts`→`edit.ts`、`routine-order.ts`→`order.ts`、`routine-input.ts`→`input.ts`、`routine-from-task.ts`→`from-task.ts`、`expand-routines.ts`→`expand.ts`、`task-operations.ts`→`operations.ts`、`testing/in-memory-*-repository.ts`→`in-memory-repository.ts`）。**据え置き**: 集約の代表型（`task.ts` 等）・横断ディレクトリ（`ports/` `shared/` `repositories/`）・機能別 usecase（`punch-usecases.ts` 等）・集約操作をまとめた `{ドメイン}-usecases.ts`（domain の集約代表と同名衝突するため `-usecases` を維持）。シンボル名（関数・型）の Task/Routine 接頭辞の揺れは今回対象外
- 結果: lint / build / test（461件）グリーン。git は全ファイルを rename として認識し履歴・blame が連続する

## T-04 postcss XSS アラートを overrides で解消（2026-07-22）

- 種別: 負債返済 / 優先度: 中
- 背景: Dependabot セキュリティアラート（medium、postcss <8.5.10 の stringify XSS）。`next@16.2.10` 同梱の古い postcss が原因（最上位の Tailwind 側は既に修正版）。自前CSS＋Tailwind のため実害は乏しいが解消しておく
- 対応: `package.json` の `overrides` で `postcss` を `^8.5.10` に固定。ツリー全体が 8.5.x（8.5.21）へ dedupe され、`npm audit` から postcss が消えた。CI の build（Tailwind/postcss）で回帰なしを確認

## T-01 CI 整備（lint / build / test の自動実行）（2026-07-22）

- 種別: ツール整備 / 優先度: 高
- 背景: 依存更新（Dependabot）の検証を手動（ブランチ取得 → `npm ci` → lint/build/test）で行っていた。定期的に発生するため機械化したかった。従来の自動チェックは Vercel ビルド（`next build`＝型チェックのみ）だけで、`npm run lint` と `npm test` は走っていなかった
- 対応: `.github/workflows/ci.yml` を新設。`pull_request` と main への `push` で `npm ci` → `lint` → `build` → `test` を実行。統合テストは Postgres サービスコンテナ（`postgres:17-alpine`、DB=`hitosuji_test`）を建て、`TEST_DATABASE_URL` を渡す（マイグレーションは vitest の globalSetup が自動適用）。Node は本番に合わせて 24
- 方針: CI は**検証のみ**。Dependabot PR がグリーンでもマージ（＝main への push ＝本番デプロイ）は手動で、オーナーの合図を待つ。自動マージ・CI 必須チェック化（ブランチ保護）はしない
