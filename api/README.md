# API Scaffold (Azure Functions)

## Endpoints
- `POST /api/extractTerms`
- `POST /api/explainTerm`
- `POST /api/generateNotes`

## Response Shape
- `extractTerms`: `{ source, terms: [{ term, summary, score, reasons[] }] }`
- `explainTerm`: `{ source, detail, style, caution }`
- `generateNotes`: `{ source, notes, stats }`

## Azure OpenAI Configuration
Copy `local.settings.example.json` to `local.settings.json` and fill:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION` (default `2024-10-21`)

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
