#!/usr/bin/env bash
# Post-deploy smoke gate. Run by Cloud Build against the candidate revision URL
# before any production traffic is routed to it (see cloudbuild.yaml).
# Each check guards a regression we actually shipped once:
#   - UI images 404 (gcloudignore dropped web/assets/images)
#   - Vertex silently disabled (env vars collapsed on revision 00004)
# Usage: SMOKE_BASE_URL=https://... bash scripts/smoke_test.sh
set -uo pipefail

BASE="${SMOKE_BASE_URL:?SMOKE_BASE_URL is required (candidate or service URL)}"
BASE="${BASE%/}"
FAILED=0

note() { echo "[smoke] $*"; }
fail() { echo "[smoke] NG: $*" >&2; FAILED=1; }

expect_status() { # name path expected
  local name="$1" path="$2" expected="$3" code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "$expected" ]; then note "OK: $name ($code)"; else fail "$name expected $expected got $code"; fi
}

# 1. UI and static assets (gcloudignore regression gate)
expect_status "GET /" "/" 200
expect_status "UI image" "/assets/images/title_logo.png" 200

# 2. Security hardening still in place
expect_status "bad percent-encoding rejected" "/%zz" 400
expect_status "path traversal rejected" "/..%2f..%2fpackage.json" 403

# 3. extractTerms: dictionary route + agent trace
body=$(curl -s -X POST "$BASE/api/extractTerms" -H "Content-Type: application/json" \
  -d '{"text":"ADR SKU RAG","skipAi":true,"useDispatcher":true}')
if echo "$body" | grep -q '"term"'; then note "OK: extractTerms returns terms"; else fail "extractTerms no terms: $(echo "$body" | head -c 200)"; fi
if echo "$body" | grep -q '"trace"'; then note "OK: extractTerms agent trace present"; else fail "extractTerms agent trace missing"; fi

# 4. explainTerm must reach Vertex AI Gemini (env-var regression gate).
#    Retries ride out transient AI errors; a config regression fails all attempts.
ok=""
for attempt in 1 2 3; do
  body=$(curl -s -X POST "$BASE/api/explainTerm" -H "Content-Type: application/json" \
    -d '{"term":"ADR","context":"architecture decision record review"}')
  if echo "$body" | grep -q '"source":"vertex_gemini"'; then ok=1; break; fi
  note "explainTerm attempt $attempt did not return vertex_gemini, retrying..."
  sleep 5
done
if [ -n "$ok" ]; then note "OK: explainTerm source=vertex_gemini"; else fail "explainTerm never reached Vertex Gemini: $(echo "$body" | head -c 300)"; fi

# 5. transcribeAudio: Speech-to-Text relay accepts audio (0.3s of silence -> empty text is fine)
PY_BIN=$(command -v python3 || command -v python || true)
if [ -n "$PY_BIN" ]; then
  AUDIO_B64=$("$PY_BIN" - <<'PY'
import base64, struct
sr = 16000
data = b"\x00\x00" * int(sr * 0.3)
header = (b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt "
          + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
          + b"data" + struct.pack("<I", len(data)))
print(base64.b64encode(header + data).decode())
PY
)
  body=$(curl -s -X POST "$BASE/api/transcribeAudio" -H "Content-Type: application/json" \
    -d "{\"audioContent\":\"$AUDIO_B64\",\"mimeType\":\"audio/wav\",\"languageCode\":\"ja-JP\"}")
  if echo "$body" | grep -q '"source":"google_speech_to_text"'; then note "OK: transcribeAudio relay"; else fail "transcribeAudio failed: $(echo "$body" | head -c 300)"; fi
else
  note "SKIP: transcribeAudio (no python available to synthesize test audio)"
fi

if [ "$FAILED" -ne 0 ]; then
  echo "[smoke] FAILED — candidate revision is NOT promoted; production traffic unchanged." >&2
  exit 1
fi
note "all checks passed — candidate is safe to promote"
