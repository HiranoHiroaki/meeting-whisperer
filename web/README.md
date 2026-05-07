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
- Live API mode calls `http://localhost:7071/api` by default.
- Start Azure Functions locally first, then switch Mode to `Live API`.
- `API Base` can be changed and saved from UI.
- `Ping API` checks `extractTerms` connectivity quickly.
