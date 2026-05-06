# Implementation Plan (MVP)

## Goal
ハッカソン提出可能なMVPを短期間で完成させる。

## Phase 0: Setup (0.5 day)
1. Azure Functions TypeScript プロジェクト初期化
2. APIルート雛形 (`extractTerms`, `explainTerm`, `generateNotes`) 作成
3. フロント静的ページ雛形作成

## Phase 1: Core UX (1 day)
1. 会議ログ入力UI実装
2. `extractTerms` 呼び出し実装
3. 候補カード表示実装 (最大5件)
4. `unknown` / `interest` ボタン実装

## Phase 2: Explanation & Notes (1 day)
1. クリック時に `explainTerm` を遅延呼び出し
2. 推定表現テンプレートを適用
3. `generateNotes` 実装
4. 今日の知ったかまとめ表示

## Phase 3: Knowledge Profile (1 day)
1. クリック履歴モデル定義
2. ルール実装
   - `unknown` 3回 -> `Weak`
   - `interest` 1回 -> `Curious`
   - 7日非接触で `Recently Learned` 除外
3. `knowledge_profile.md` 生成・更新
4. 履歴削除UI実装

## Phase 4: Quality & Demo (0.5 day)
1. 固定デモログでE2E確認
2. レスポンス時間計測と改善
3. 文言統一 (断定禁止)
4. 審査向けデモ手順確定

## Technical Task Breakdown
1. Frontend
- 2カラムレイアウト
- 候補カードコンポーネント
- 説明パネル
- まとめパネル

2. Backend (Azure Functions)
- `POST /api/extractTerms`
- `POST /api/explainTerm`
- `POST /api/generateNotes`

3. Prompt/LLM
- 用語抽出プロンプト
- 推定表現を強制する説明プロンプト
- 個人化まとめ生成プロンプト

4. Storage
- localStorage: クリック履歴
- ローカルファイル: `knowledge_profile.md`

## Acceptance Criteria
1. 候補語が最大5件で安定して表示される
2. クリック後に文脈付き説明が返る
3. `unknown` / `interest` が別々に保存される
4. `knowledge_profile.md` がルール通り更新される
5. 3分デモが止まらず完走できる

## Risks and Mitigations
1. 誤抽出
- 断定せず候補提示に限定

2. ハルシネーション
- 推定テンプレートを強制

3. レイテンシ
- 詳細はクリック時生成に限定

4. スコープ肥大
- Teams/音声はMVP外を厳守
