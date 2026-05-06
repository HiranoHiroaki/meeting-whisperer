# API Specification (Draft)

## POST /api/extractTerms
### Request
```json
{
  "text": "会議ログ"
}
```

### Response
```json
[
  {
    "term": "ADR",
    "summary": "設計判断履歴のことを指す可能性",
    "score": 0.92,
    "reasons": ["uppercase", "acronym", "domain_specific"]
  }
]
```

### Rules
- 返却件数は最大5件
- 候補は断定ではなく推定として扱う

## POST /api/explainTerm
### Request
```json
{
  "term": "ADR",
  "context": "会議ログ"
}
```

### Response
```json
{
  "detail": "この会議では ADR は設計判断履歴を指している可能性があります。"
}
```

### Rules
- 社内語・固有語は推定表現を使う
- 断定文を返さない

## POST /api/generateNotes
### Request
```json
{
  "clickedTerms": [
    { "term": "ADR", "action": "unknown" },
    { "term": "SKU", "action": "interest" }
  ],
  "meetingText": "..."
}
```

### Response
```json
{
  "notes": "今回の会議では..."
}
```

## Error Response (Common)
```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "text is required"
  }
}
```
