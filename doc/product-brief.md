# Product Brief

## Project Name
- 暫定: 知ったかくん / Meeting Whisperer / Bluff Assist / Context Copilot

## Core Concept
会議中に「知らない単語」を即時に補完し、会議進行を止めずに理解を追いつかせる。

## Non-goal
- 会議全体の高品質議事録を作ることを主目的にしない
- いきなりリアルタイム音声認識やTeams本番統合をやらない

## Target Users
- 新人
- 他部署参加者
- プロジェクト途中参加者
- 専門領域外の参加者

## UX Principles
- 1画面
- 邪魔しない
- クリック最小
- 会議を止めない
- 断定しない

## Main Flow
1. ユーザーが会議ログを貼り付け
2. システムが「未知の可能性が高い語」を最大5件で候補表示
3. ユーザーが `unknown` または `interest` を選択
4. 文脈付き説明を推定表現で表示
5. クリック履歴を保存
6. 会議後に「今日の知ったかまとめ」を生成

## Differentiator
一般的AI: 会議の全体要約

本プロダクト: 個人が理解できていない箇所だけ補完

## Long-term Value
クリック履歴から「個人理解モデル」を構築し、
将来的に先回り補助や文脈別説明の精度を向上させる。

## Guardrail
`knowledge_profile` は評価や監視ではなく、成長ログとして扱う。
