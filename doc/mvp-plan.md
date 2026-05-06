# MVP Plan

## Priority
1. 会議テキスト入力
2. 用語抽出 (最大5件)
3. 用語説明 (クリック時生成)
4. クリック履歴保存 (`unknown` / `interest`)
5. 今日の知ったかまとめ
6. knowledge profile 更新

## Fixed Rules
- 抽出は「怪しい候補」を広めに拾う
- 候補表示は最大5件
- 説明は推定表現を使い、断定しない
- 抽出結果を先出しし、詳細は遅延生成

## Out of Scope (Hackathon MVP)
- リアルタイム音声認識
- Teamsリアルタイム会議連携
- Teams SDK / Bot
- WebSocket中心のリアルタイム基盤
- 複雑な認可・権限管理
- AKS / Kubernetes
- 過剰なマルチエージェント化

## Success Criteria
- 3分以内にデモ可能
- 初見ユーザーが迷わないUI
- クリックした語に対して文脈付き説明が返る
- 会議後まとめが個人観点になっている
- `knowledge_profile.md` が更新される

## MVP Done Definition
1. 会議ログ入力ができる
2. 用語候補を5件まで表示できる
3. クリック時に詳細説明を表示できる
4. `unknown` / `interest` の履歴が残る
5. 「今日の知ったかまとめ」が生成できる
6. `knowledge_profile.md` を自動更新できる

## Demo Script (Short)
1. 新人が途中参加した想定の会議ログを貼る
2. ADR / SKU / Aegis / SAP / RAG などの候補が出る
3. `unknown` と `interest` を押して説明を見る
4. まとめ生成を押す
5. `knowledge_profile.md` の更新結果を示す
