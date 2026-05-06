# Knowledge Profile Spec

## File
- `knowledge_profile.md` (MVPではローカル生成)

## Purpose
ユーザーの理解傾向を継続保存し、次回以降の補助品質を上げる。

## Example Structure
```md
# User Knowledge Profile

## Familiar
- React
- REST API
- AWS

## Weak
- ADR
- SKU
- SAP

## Recently Learned
- Aegis
- Architecture Decision Record

## Frequently Queried Topics
- Inventory
- Project Management
```

## Update Rules (MVP Draft)
- クリック頻度が高い語は `Weak` 候補
- 直近で説明閲覧した語は `Recently Learned`
- 語をトピック分類して `Frequently Queried Topics` を更新

## Future Extension
- プロジェクト別コンテキスト
- 部署別辞書
- 説明レベルの自動調整
