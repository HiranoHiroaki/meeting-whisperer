# API (Cloud Run / Vercel互換ハンドラ)

## Endpoints
- `POST /api/extractTerms`
- `POST /api/explainTerm`
- `POST /api/generateNotes`
- `POST /api/generateMinutes`
- `POST /api/transcribeAudio`

## Response Shape
- `extractTerms`: `{ source, terms: [{ term, summary, score, reasons[] }] }`
- `explainTerm`: `{ source, detail, style, caution }`
- `generateNotes`: `{ source, notes, stats }`
- `generateMinutes`: `{ source, minutes }`
- `transcribeAudio`: `{ text, languageCode, source: "google_speech_to_text" }`

## Speech-to-Text Relay
`transcribeAudio` は base64 音声セグメント（webm/ogg opus, wav）を受け取り、Google Cloud Speech-to-Text (`speech.googleapis.com`, sync recognize) に中継する。認証はADC（Cloud Runサービスアカウント / ローカルgcloud ADC）でAPIキー不要。ローカルで使う場合は `GOOGLE_CLOUD_QUOTA_PROJECT` で課金プロジェクトを明示すること。

## Dictionary Dispatcher (New)
`extractTerms` now uses deterministic dispatcher before LLM:

- all dictionaries are scanned
- per-line max 3 candidates
- same category max 2 within a line
- score threshold: 80+
- top results returned first (source=`dictionary_dispatcher`)

LLM/heuristic are fallback when dictionary hit is empty.

## Dictionary-First Explain
`explainTerm` checks local dictionaries before LLM:

1. exact match
2. alias match
3. acronym-like match
4. AI fallback

Dictionary files:
- `assets/dictionary/*_seed_dictionary.json`
- `api/dict/core-business.json`
- `api/dict/core-it.json`
- `api/dict/core-ai.json`
- `api/dict/cloud-azure.json`
- `api/dict/project-local.json`

## Azure OpenAI Configuration (legacy fallback)
本番はVertex AI Gemini。旧構成のフォールバックとして以下を環境変数で設定可能:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION` (default `2024-10-21`)

Security notes:
- `local.settings.json` is local-only and gitignored. Never commit keys, connection strings, or function keys.
- If a key leaks, rotate it at the provider first, then replace local values.

## OpenAI-Compatible Configuration (Kimi etc.)
Another fallback option:

- `OPENAI_COMPAT_BASE_URL` (example: `https://api.moonshot.cn/v1`)
- `OPENAI_COMPAT_API_KEY`
- `OPENAI_COMPAT_MODEL` (example: `kimi-k2.6`)

Aliases also supported:
- `KIMI_BASE_URL`
- `KIMI_API_KEY`
- `KIMI_MODEL`

## Vertex AI Gemini Configuration (current production)
No API key. Uses ADC (Cloud Run service account, or local gcloud ADC):

- `GOOGLE_GENAI_USE_VERTEXAI=true`
- `GOOGLE_CLOUD_PROJECT` (e.g. `meeting-whisperer-prod`)
- `GOOGLE_CLOUD_LOCATION=global` (required for Gemini 2.5 models)
- `GEMINI_MODEL` (default `gemini-2.5-flash`)

Provider priority:
1. Vertex AI Gemini
2. Azure OpenAI
3. OpenAI-compatible
4. Heuristic fallback

Note:
- If `AZURE_OPENAI_ENDPOINT` is already `.../openai/v1/` (Foundry v1 style), the app automatically treats it as OpenAI-compatible route and uses `AZURE_OPENAI_DEPLOYMENT` as `model`.

## Local Setup
リポジトリルートのサーバでAPIごと起動する:

```powershell
cd E:\Document\meeting-whisperer
npm install
npm run build:server
npm start
```

API base: `http://localhost:8080/api`

## Rate Limit Defaults
- Rate limit is enabled by default. Disable only for controlled local tests with `MW_ENABLE_RATE_LIMIT=0`.
