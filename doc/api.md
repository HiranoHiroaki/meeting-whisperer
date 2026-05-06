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
    "summary": "設計判断履歴"
  }
]
```

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
  "detail": "この案件では..."
}
```

## POST /api/generateNotes
### Request
```json
{
  "clickedTerms": ["ADR", "SKU"],
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
