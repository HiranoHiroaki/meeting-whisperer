# Knowledge Profile Spec

## File
- `knowledge_profile.md` (MVPではローカル生成)

## Purpose
ユーザーの理解傾向を継続保存し、次回以降の補助品質を上げる。

## Positioning
- 本ファイルは評価・監視のために使わない。
- 学習の成長ログとして扱う。

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

## Curious
- RAG
- Aegis

## Recently Learned
- Aegis
- Architecture Decision Record

## Frequently Queried Topics
- Inventory
- Project Management
```

## Input Signals
- `unknown`: 本当に知らない
- `interest`: もっと知りたい

## Update Rules (MVP Fixed)
- 同一語で `unknown` が3回: `Weak` へ追加
- 同一語で `interest` が1回: `Curious` へ追加
- 最終接触から7日経過: `Recently Learned` から除外

## Data Handling (MVP)
- ローカル保存を初期値とする
- ユーザーは履歴とプロフィールをいつでも削除できる

## Future Extension
- プロジェクト別コンテキスト
- 部署別辞書
- 説明レベルの自動調整
