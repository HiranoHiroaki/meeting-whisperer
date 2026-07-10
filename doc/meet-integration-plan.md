# Google Meet 連携プラン（構想）

Teams / Microsoft Graph 前提だった transcript 取込ルートを、Google Meet REST API 前提に置き換えるための設計メモ。
現時点では検証用の Google Workspace 環境がないため、UI は Mock 導線（「Meet取込」タブ）のみ実装している。
本ドキュメントは本番連携時のルート確保が目的。

## 全体ルート

```
[ユーザー] Meet URL (https://meet.google.com/xxx-yyyy-zzz) or conferenceRecord ID
   │
   ▼
[Cloud Run /api/meetTranscript (未実装)]
   1. meetingCode を URL から抽出
   2. conferenceRecords.list  … filter="space.meeting_code=xxx-yyyy-zzz" で会議実体を解決
   3. conferenceRecords.transcripts.list … transcript の存在確認（会議終了後に生成される）
   4. conferenceRecords.transcripts.entries.list … 発話単位のエントリ取得
   5. entries -> TranscriptLine[] { speaker, text, at_ms } に正規化
   │
   ▼
[web/ SessionStore] 既存の会議ログ再生導線にそのまま流し込み（Mock導線と同じ出口）
```

Mock導線（`web/main.js` の `runMeetMockRoute`）はこの 1→6 のステップ表示と出口（`applyTranscriptLinesToSession`）を既に持っているため、本番実装時は step 2〜5 を実APIに差し替えるだけでよい。

## 使用API

- **Google Meet REST API** (`meet.googleapis.com`, v2)
  - `conferenceRecords.list` / `conferenceRecords.get`
  - `conferenceRecords.transcripts.list`
  - `conferenceRecords.transcripts.entries.list`
- transcript エントリには話者（participant）と発話テキスト、タイムスタンプが含まれるため、
  知ったかくんの `TranscriptLine[]`（speaker / text / at_ms）へほぼ 1:1 で正規化できる。

## 認証・権限（ここが本丸）

- Meet の transcript はユーザーデータのため、Vertex のようなサービスアカウント単独の ADC では読めない。
  - **OAuth 2.0 ユーザー同意フロー**（scope: `https://www.googleapis.com/auth/meetings.space.readonly`）
  - または Workspace 管理者による**ドメイン全体委任**（サービスアカウント + impersonation）
- ハッカソンデモの範囲では OAuth 同意画面の審査（restricted scope）が間に合わないため Mock 導線に留める。
- 本番化する場合の推奨構成:
  - Cloud Run 上に OAuth コールバックを実装し、リフレッシュトークンは Secret Manager に保存
  - transcript 取得はサーバ側のみ（ブラウザにトークンを渡さない）

## 制約・注意

- transcript は**会議終了後**に生成される（リアルタイム字幕はMeet APIでは取れない）。
  リアルタイム側は音声入力Beta（Web Speech API / Cloud Speech-to-Text 中継）が担当し、
  Meet 連携は「終わった会議を後から知ったかくんに流す」ユースケースに割り当てる。
- transcript 生成には Google Workspace のエディション条件（Gemini/録画対応プラン）がある。
- 会議主催者が transcript を有効にしている必要がある。

## 実装タスク（本番化時）

1. `meet.googleapis.com` の有効化 + OAuth 同意画面設定
2. `api/meetTranscript.ts`: meetingCode 解決 → entries 取得 → TranscriptLine[] 返却
3. `web/main.js`: `runMeetMockRoute` の step 2〜5 を実API呼び出しに差し替え
4. Rate Limit / 入力検証は既存の `_lib/shared.ts` を流用
