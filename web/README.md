# Web Demo

## Run
Use any static file server from repository root.

```powershell
cd E:\Document\meeting-whisperer
python -m http.server 8080
```

Open: `http://localhost:8080/web/`

## Notes
- Scripted demo JSON is loaded from `doc/samples/scripted-demo/`.
- Live API mode calls `http://localhost:7071/api` by default (repo-root server: `npm start` なら `http://localhost:8080/api`).
- `API Base` can be changed and saved from UI.
- API 側が `MW_AUTH_LEVEL=function` の場合は `x-functions-key` の入力が必要です。
- API 側のレート制限は既定でONです（`MW_ENABLE_RATE_LIMIT=0` でのみ無効化）。
- `Ping API` checks `extractTerms` connectivity quickly.
- 上部コントロールは左ハンバーガーメニューに格納されます。
- 会議ログ下部に `会議終了 / 議事録作成` ボタンがあります（Markdown保存可能）。
- 補足説明は `補足説明をドキュメント化` で生成し、ローカル保存と即時再参照ができます。
- `音声入力(Beta)` タブでリアルタイム文字起こしを会議ログへ追記できます（`マイク` / `ブラウザタブ音声`）。
- 文字起こし結果は既存の `extractTerms` 導線に流れるため、抽出用語・説明・議事録生成もそのまま利用できます。
- `ブラウザタブ音声` はブラウザ実装差があります。非対応環境では既定マイク入力として扱われます。
- `文字起こしエンジン` で `Google Cloud Speech-to-Text` を選ぶと、約5秒ごとに録音した音声を `/api/transcribeAudio` 経由でGoogle STTに中継します（ブラウザ側にキー不要・サーバのADC認証）。
- `Meet取込` タブはGoogle Meet REST APIルートのMock導線です（設計は `doc/meet-integration-plan.md`）。

## Debug Mode
- Config file: `web/debug.config.js`
- URL override:
  - `?debug=1` force enable
  - `?debug=0` force disable
- Browser console helper:
  - `window.__MW_DEBUG.enable()`
  - `window.__MW_DEBUG.disable()`

When enabled, logs are printed with anchors like:
- `[MW][network]` request/response details
- `[MW][api]` live API flow
- `[MW][storage]` localStorage success/failure

UI debug card:
- Debug mode ON時だけ表示されます。
- 表示内容:
  - 読み込み済み辞書サマリ
  - dispatcher評価軸（スコア重み・閾値）
  - 各用語の通過経路（extract source / matched text / score / explain source）
- 右上トグルで表示/非表示を切り替え、固定パネル内でスクロール可能です。
- `ディスパッチャ検証` ボタンで、Scriptedモード中でも `extractTerms` を実行してカードを更新できます。
