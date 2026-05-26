# meeting-whisperer

会議中の認知ギャップ補完を目的にしたハッカソン向けプロジェクト。

## Directories
- `doc/`: 企画・仕様・サンプル会議ログ
- `web/`: Scripted Demo UI (Vanilla JS)
- `api/`: Azure Functions (TypeScript) API scaffold
- `scripts/`: 補助スクリプト

## Quick Start (Demo UI)
```powershell
cd E:\Document\meeting-whisperer
python -m http.server 8080
```

Open `http://localhost:8080/web/`.

## Live API Mode
1. Start API locally:
```powershell
cd E:\Document\meeting-whisperer\api
npm install
npm run build
func start
```
2. In web UI, switch `Mode` to `Live API`.

## Environment Settings Policy
- Local run: use `E:\Document\meeting-whisperer\api\local.settings.json` (`Values`) so Azure Functions loads them into `process.env`.
- Azure run: use Function App Settings with the same key names (also surfaced to `process.env`).
- `local.settings.json` must stay untracked (`.gitignore`).
- If any API key / connection string / function key is leaked, regenerate it in Azure Portal and replace both Azure App Settings and local `Values`.

## Provider Smoke Tests (Python)
```powershell
cd E:\Document\meeting-whisperer
python scripts\provider_smoke_test.py
python scripts\fetch_sample_terms.py --sample 1
```
