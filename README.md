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

## Provider Smoke Tests (Python)
```powershell
cd E:\Document\meeting-whisperer
python scripts\provider_smoke_test.py
python scripts\fetch_sample_terms.py --sample 1
```
