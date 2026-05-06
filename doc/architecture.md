# Architecture (MVP)

## Frontend
- HTML / CSS / Vanilla JS
- 2カラムUI
  - 左: 会議ログ
  - 右: 用語カードと説明

## Backend
- Azure Functions (TypeScript)
- HTTP Trigger API

## AI
- Azure OpenAI (or Foundry)
- 用語抽出 / 説明生成 / まとめ生成

## Storage
- MVP: localStorage + JSON
- Future: Cosmos DB / Blob Storage

## Logical Components
- Term Extractor
- Term Explainer
- Notes Generator
- Click History Tracker
- Knowledge Profile Updater

## Data Flow
1. `extractTerms`: 会議テキスト -> 候補用語配列
2. `explainTerm`: 選択用語 + 会議文脈 -> 詳細説明
3. `generateNotes`: クリック履歴 + 会議テキスト -> 個人向けまとめ
4. profile更新: クリック履歴を知識プロファイルに反映

## Deployment Options
- Azure Functions (Consumption)
- Azure App Service (必要時)
- Container Apps (将来拡張時)
