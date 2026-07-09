# API Scaffold (Azure Functions)

## Endpoints
- `POST /api/extractTerms`
- `POST /api/explainTerm`
- `POST /api/generateNotes`

## Response Shape
- `extractTerms`: `{ source, terms: [{ term, summary, score, reasons[] }] }`
- `explainTerm`: `{ source, detail, style, caution }`
- `generateNotes`: `{ source, notes, stats }`

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

## Azure OpenAI Configuration
Copy `local.settings.example.json` to `local.settings.json` and fill:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION` (default `2024-10-21`)

Environment source rules:
- Local development: set values in `local.settings.json` under `Values` (loaded into `process.env` by Functions Core Tools).
- Azure production: set the same keys in Function App Settings (also exposed as `process.env` at runtime).

Security notes:
- `local.settings.json` is local-only and gitignored. Never commit keys, connection strings, or function keys.
- If a key leaks, regenerate/rotate it in Azure Portal first, then replace the corresponding Function App Setting and local `Values`.
- `AzureWebJobsStorage` and `AZURE_OPENAI_API_KEY` are secrets and must not appear in code, docs, or examples as real values.

## OpenAI-Compatible Configuration (Kimi etc.)
If Azure OpenAI is unavailable, set:

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
```powershell
cd E:\Document\meeting-whisperer\api
npm install
npm run build
func start
```

> `func` requires Azure Functions Core Tools installed locally.

## Auth / Rate Limit Defaults
- HTTP trigger auth defaults to `function` (requires `x-functions-key`) unless `MW_AUTH_LEVEL=anonymous` is set.
- Rate limit is enabled by default. Disable only for controlled local tests with `MW_ENABLE_RATE_LIMIT=0`.
