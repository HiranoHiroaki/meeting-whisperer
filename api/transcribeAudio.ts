import type { VercelRequest, VercelResponse } from "@vercel/node";
import { consumeRateLimit, handlePreflight, sendJson } from "./_lib/shared.js";

// Google Cloud Speech-to-Text (sync recognize) relay.
// The browser records short audio segments (MediaRecorder) and posts them here;
// auth is ADC on the Cloud Run service account — no API keys, same policy as Vertex.
const SPEECH_ENDPOINT = "https://speech.googleapis.com/v1/speech:recognize";
const REQUEST_TIMEOUT_MS = 15_000;
// Keep well under the server's 1MB JSON body cap (segments are ~5s of opus).
const MAX_AUDIO_BASE64_CHARS = 900_000;

type TranscribeRequest = {
  audioContent?: string;
  mimeType?: string;
  languageCode?: string;
};

type SpeechRecognizeResponse = {
  results?: Array<{
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  }>;
};

type AuthClientLike = {
  request: (opts: {
    url: string;
    method: string;
    data: unknown;
    timeout: number;
    headers?: Record<string, string>;
  }) => Promise<{ data: SpeechRecognizeResponse }>;
};

let cachedClient: AuthClientLike | null = null;

async function getAuthClient(): Promise<AuthClientLike> {
  if (cachedClient) return cachedClient;
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });
  cachedClient = (await auth.getClient()) as unknown as AuthClientLike;
  return cachedClient;
}

function resolveAudioConfig(mimeType: string): { encoding?: string; sampleRateHertz?: number } {
  const mt = mimeType.toLowerCase();
  if (mt.includes("webm")) return { encoding: "WEBM_OPUS", sampleRateHertz: 48000 };
  if (mt.includes("ogg")) return { encoding: "OGG_OPUS", sampleRateHertz: 48000 };
  // WAV/FLAC headers are self-describing; let the API read them.
  if (mt.includes("wav") || mt.includes("flac")) return {};
  return { encoding: "WEBM_OPUS", sampleRateHertz: 48000 };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  console.log("transcribeAudio called");
  if (handlePreflight(req, res)) return;

  const limit = consumeRateLimit(req, "transcribeAudio");
  if (!limit.allowed) {
    sendJson(res, req, 429, { error: { code: "RATE_LIMIT", message: "Too many requests" }, retryAfterSec: limit.retryAfterSec });
    return;
  }

  const payload = (req.body ?? {}) as TranscribeRequest;
  const audioContent = typeof payload.audioContent === "string" ? payload.audioContent.trim() : "";
  if (!audioContent) {
    sendJson(res, req, 400, { error: { code: "INVALID_INPUT", message: "audioContent (base64) is required" } });
    return;
  }
  if (audioContent.length > MAX_AUDIO_BASE64_CHARS) {
    sendJson(res, req, 413, { error: { code: "PAYLOAD_TOO_LARGE", message: "audio segment too large" } });
    return;
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(audioContent)) {
    sendJson(res, req, 400, { error: { code: "INVALID_INPUT", message: "audioContent must be base64" } });
    return;
  }
  const languageCode =
    typeof payload.languageCode === "string" && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(payload.languageCode.trim())
      ? payload.languageCode.trim()
      : "ja-JP";
  const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "audio/webm";

  try {
    const client = await getAuthClient();
    const quotaProject =
      (process.env.GOOGLE_CLOUD_QUOTA_PROJECT ?? "").trim() ||
      (process.env.GOOGLE_CLOUD_PROJECT ?? "").trim();
    const response = await client.request({
      url: SPEECH_ENDPOINT,
      method: "POST",
      timeout: REQUEST_TIMEOUT_MS,
      headers: quotaProject ? { "x-goog-user-project": quotaProject } : undefined,
      data: {
        config: {
          ...resolveAudioConfig(mimeType),
          languageCode,
          enableAutomaticPunctuation: true,
          model: "default"
        },
        audio: { content: audioContent }
      }
    });

    const text = (response.data.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();

    sendJson(res, req, 200, { text, languageCode, source: "google_speech_to_text" });
  } catch (error) {
    const message = String(error);
    console.error(`transcribeAudio failed: ${message}`);
    const notConfigured =
      message.includes("Could not load the default credentials") ||
      message.includes("SERVICE_DISABLED") ||
      message.includes("PERMISSION_DENIED");
    sendJson(res, req, notConfigured ? 503 : 502, {
      error: {
        code: notConfigured ? "STT_NOT_CONFIGURED" : "STT_FAILED",
        message: notConfigured
          ? "Google Cloud Speech-to-Text is not configured on this deployment"
          : "Speech-to-Text request failed"
      }
    });
  }
}
