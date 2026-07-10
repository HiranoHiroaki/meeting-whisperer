# meeting-whisperer（知ったかくん）

会議中の認知ギャップ補完を目的にしたハッカソン向けプロジェクト。
会議に出てきた「知らない言葉」を拾い、固定辞書・自分辞書・AI説明（Gemini）に振り分けて、あとで追いつくための会議支援AIエージェント。

## Directories
- `doc/`: 企画・仕様・サンプル会議ログ
- `web/`: Demo UI (Vanilla JS)
- `api/`: API functions (TypeScript) — extractTerms / explainTerm / generateNotes / generateMinutes / transcribeAudio
- `server/`: Cloud Run 用エントリポイント（静的UI配信 + `/api/*` ルーティング）
- `scripts/`: 補助スクリプト

## Deployment (Google Cloud)
Cloud Run 1サービスに静的UIとAPIを同居。AIは Vertex AI 経由の Gemini（APIキーレス、ADC認証）。

### CI/CD (Cloud Build)
`cloudbuild.yaml` がパイプライン本体。main への push（またはmanual submit）で:

1. コンテナビルド → Artifact Registry
2. 新リビジョンを `--no-traffic` + `--tag=candidate` でデプロイ（本番トラフィックは動かさない）
3. candidate URL に対して `scripts/smoke_test.sh` を実行（UI/画像/セキュリティ応答/Vertex Gemini到達/STT中継を検証）
4. 全チェック合格時のみ本番トラフィックを新リビジョンへ切替

```bash
# 手動実行（トリガー未接続時）
gcloud builds submit --config=cloudbuild.yaml --project=<PROJECT_ID> \
  --substitutions=COMMIT_SHA=$(git rev-parse HEAD)
```

### 手動デプロイ（従来方式）

```powershell
gcloud run deploy meeting-whisperer `
  --source . `
  --project=<PROJECT_ID> `
  --region=us-central1 `
  --allow-unauthenticated `
  --min-instances=0 `
  --set-env-vars=GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=<PROJECT_ID>,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-2.5-flash,MW_EXPLAIN_AI_FIRST=1
```

- `MW_EXPLAIN_AI_FIRST=1`: 用語説明を辞書即答ではなく常に Gemini（文脈込み・辞書情報をベースラインに使用）で生成する。AI失敗時は辞書にフォールバック。審査・デモでAI呼び出しを可視化したい時に有効化する
- `.gcloudignore` は明示管理。gcloud の gitignore 解釈は `assets/images/` を任意階層に誤適用して `web/assets/images`（UI画像）を除外してしまうため、`#!include:.gitignore` を使わないこと

必要なAPI: `run.googleapis.com` / `cloudbuild.googleapis.com` / `artifactregistry.googleapis.com` / `aiplatform.googleapis.com` / `speech.googleapis.com`

音声入力Betaの `Google Cloud Speech-to-Text` は `/api/transcribeAudio` がサーバ側でADC認証して中継する（ブラウザにキーを置かない）。Google Meet 取込はMock導線（設計: `doc/meet-integration-plan.md`）。

## Quick Start (Local)
```powershell
cd E:\Document\meeting-whisperer
npm install
npm run build:server
npm start
```

Open `http://localhost:8080/`.

Gemini を使う場合は環境変数を設定してから起動する:

```powershell
$env:GOOGLE_GENAI_USE_VERTEXAI="true"
$env:GOOGLE_CLOUD_PROJECT="<PROJECT_ID>"
$env:GOOGLE_CLOUD_LOCATION="global"
npm start
```

## AI Provider
`api/_lib/aiClient.ts` は複数プロバイダ対応。優先順:

1. Vertex AI Gemini（`GOOGLE_GENAI_USE_VERTEXAI=true`、APIキー不使用）
2. Azure OpenAI（`AZURE_OPENAI_*`）
3. OpenAI互換API（`OPENAI_COMPAT_*`）
4. 辞書 + ヒューリスティックフォールバック（AI設定なしでも動く）

## Environment Settings Policy
- シークレットはコミットしない（`.env` / `api/local.settings.json` は gitignore 済み）
- Vertex AI ルートはAPIキー不要（Cloud Run のサービスアカウントで認証）
- Rate Limit はデフォルト有効（`MW_ENABLE_RATE_LIMIT=0` でローカル検証時のみ無効化可）

## Provider Smoke Tests (Python)
```powershell
cd E:\Document\meeting-whisperer
python scripts\provider_smoke_test.py
python scripts\fetch_sample_terms.py --sample 1
```
