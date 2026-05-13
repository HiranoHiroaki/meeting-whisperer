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

Security notes:
- `local.settings.json` is local-only. Do not paste production keys into shared screenshots/logs.
- Prefer rotating API keys periodically and use least-privilege keys where possible.
- `AzureWebJobsStorage` and `AZURE_OPENAI_API_KEY` should be treated as secrets.

## OpenAI-Compatible Configuration (Kimi etc.)
If Azure OpenAI is unavailable, set:

- `OPENAI_COMPAT_BASE_URL` (example: `https://api.moonshot.cn/v1`)
- `OPENAI_COMPAT_API_KEY`
- `OPENAI_COMPAT_MODEL` (example: `kimi-k2.6`)

Aliases also supported:
- `KIMI_BASE_URL`
- `KIMI_API_KEY`
- `KIMI_MODEL`

Provider priority:
1. Azure OpenAI
2. OpenAI-compatible
3. Heuristic fallback

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
