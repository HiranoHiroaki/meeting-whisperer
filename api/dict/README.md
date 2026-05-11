# Dictionary Layer (MVP)

`explainTerm` is dictionary-first, and `extractTerms` uses deterministic dictionary dispatch first.

1. exact term match
2. alias match
3. acronym-like match
4. LLM / heuristic fallback

## Local Override Files
- `core-business.json`
- `core-it.json`
- `core-ai.json`
- `cloud-azure.json`
- `project-local.json`

These are loaded after seed dictionaries, so local files can override entries.

## Seed Dictionaries
Primary seed files are loaded from:
- `assets/dictionary/it_seed_dictionary.json`
- `assets/dictionary/business_seed_dictionary.json`
- `assets/dictionary/medical_seed_dictionary.json`
- `assets/dictionary/fashion_seed_dictionary.json`
- `assets/dictionary/pc_otaku_seed_dictionary.json`
- `assets/dictionary/gyaru_seed_dictionary.json`
- `assets/dictionary/manufacturing_seed_dictionary.json`

## Entry Format
Each file is a JSON array:

```json
[
  {
    "term": "ADR",
    "aliases": ["Architecture Decision Record"],
    "category": "engineering",
    "short": "設計上の判断と理由を記録する文書。",
    "long": "背景・選択肢・決定・結果を残し、後で判断理由を追えるようにする。",
    "tags": ["architecture"],
    "confidence": 0.95,
    "source": "fixed"
  }
]
```

### Required
- `term` (string)
- `short` (string)

### Optional
- `aliases` (string[])
- `category` (string)
- `long` (string)
- `tags` (string[])
- `confidence` (0.0 - 1.0)
- `source` (string)

`project-local.json` is treated as layer `project_local`.
