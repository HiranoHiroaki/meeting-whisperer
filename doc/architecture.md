# Architecture

## Frontend
- HTML / CSS / Vanilla JS
- 2カラムUI
  - 左: 会議ログ
  - 右: 用語カードと説明

## Backend
- Cloud Run (Node.js / TypeScript)
- `server/index.ts` が静的UI配信と `/api/*` ルーティングを担当
- API functions: `api/*.ts`（Vercel互換ハンドラ形式）

## AI
- Vertex AI 経由の Gemini 2.5 Flash（APIキーレス・ADC認証・`GOOGLE_CLOUD_LOCATION=global`）
- 用語抽出 / 説明生成 / まとめ生成 / 議事録生成
- フォールバック: Azure OpenAI / OpenAI互換API / 辞書+ヒューリスティック

## Speech / Meeting Ingest
- 音声入力Beta: Web Speech API（ブラウザ完結）/ Google Cloud Speech-to-Text（`/api/transcribeAudio` 中継、ADC認証・キーレス）
- Google Meet 取込: Mock導線のみ（本番ルート設計は `doc/meet-integration-plan.md`）

## Storage
- MVP: localStorage + JSON
- Future: Firestore / Cloud Storage

## Logical Components
- Term Extractor
- Term Explainer
- Notes Generator
- Click History Tracker
- Knowledge Profile Updater
- Dictionary Dispatcher（固定辞書8分野 + プロジェクト辞書 + 自分辞書）

## Data Flow
1. `extractTerms`: 会議テキスト -> 候補用語配列（Fast: 辞書 / Full: Gemini）
2. `explainTerm`: 選択用語 + 会議文脈 -> 詳細説明
3. `generateNotes`: クリック履歴 + 会議テキスト -> 個人向けまとめ
4. `generateMinutes`: 会議テキスト -> 議事録
5. `transcribeAudio`: 音声セグメント(base64) -> Google STT -> テキスト
6. profile更新: クリック履歴を知識プロファイルに反映

## Deployment
- Cloud Run（min-instances=0、静的UI + API 同一コンテナ）
- Cloud Build（`gcloud run deploy --source` で Dockerfile ビルド）
- Artifact Registry（ビルドイメージ格納）
