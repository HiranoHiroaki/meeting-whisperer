import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
];

function resolveAllowedOrigins(): string[] {
  const raw = (process.env.CORS_ALLOWED_ORIGINS ?? "").trim();
  return raw
    ? raw.split(",").map((x) => x.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
}

function resolveCorsOrigin(reqOrigin: string): string {
  const allowed = resolveAllowedOrigins();
  if (!reqOrigin) return allowed[0] ?? "http://localhost:5173";
  if (allowed.includes(reqOrigin)) return reqOrigin;
  if (allowed.includes("*")) return reqOrigin;
  try {
    const parsed = new URL(reqOrigin);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname.endsWith(".vercel.app") ||
        parsed.hostname.endsWith(".azurestaticapps.net") ||
        parsed.hostname.endsWith(".run.app"))
    ) {
      return reqOrigin;
    }
  } catch {
    // ignore invalid origin
  }
  return allowed[0] ?? "http://localhost:5173";
}

export function setCorsHeaders(res: VercelResponse, req: VercelRequest): void {
  const origin = resolveCorsOrigin(String(req.headers.origin ?? ""));
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-functions-key");
}

export function handlePreflight(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method?.toUpperCase() !== "OPTIONS") return false;
  setCorsHeaders(res, req);
  res.status(204).end();
  return true;
}

export function sendJson(res: VercelResponse, req: VercelRequest, status: number, body: unknown): void {
  setCorsHeaders(res, req);
  res.status(status).json(body);
}

type RateWindow = { startMs: number; count: number };
const RATE_BUCKET = new Map<string, RateWindow>();
const RATE_WINDOW_MS = Number(process.env.MW_RATE_WINDOW_MS ?? 60_000);
const RATE_LIMIT = Number(process.env.MW_RATE_LIMIT_PER_WINDOW ?? 120);

export function consumeRateLimit(
  req: VercelRequest,
  scope: string
): { allowed: boolean; retryAfterSec: number } {
  const enabled = process.env.MW_ENABLE_RATE_LIMIT !== "0";
  if (!enabled) return { allowed: true, retryAfterSec: 0 };
  const xfwd = String(req.headers["x-forwarded-for"] ?? "");
  const client =
    xfwd.split(",")[0]?.trim() ||
    String(req.headers["x-real-ip"] ?? "") ||
    "unknown";
  const key = `${scope}:${client}`;
  const now = Date.now();
  const current = RATE_BUCKET.get(key);
  if (!current || now - current.startMs > RATE_WINDOW_MS) {
    RATE_BUCKET.set(key, { startMs: now, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }
  current.count += 1;
  if (current.count <= RATE_LIMIT) return { allowed: true, retryAfterSec: 0 };
  const retryAfterSec = Math.max(
    1,
    Math.ceil((RATE_WINDOW_MS - (now - current.startMs)) / 1000)
  );
  return { allowed: false, retryAfterSec };
}

export function readStringField(
  payload: Record<string, unknown>,
  field: string,
  opts?: { required?: boolean; maxChars?: number }
): { ok: true; value: string } | { ok: false; code: string; message: string } {
  const required = opts?.required ?? false;
  const maxChars = opts?.maxChars ?? 20000;
  const raw = payload[field];

  if (raw == null) {
    if (required)
      return { ok: false, code: "INVALID_INPUT", message: `${field} is required` };
    return { ok: true, value: "" };
  }
  if (typeof raw !== "string")
    return { ok: false, code: "INVALID_INPUT", message: `${field} must be string` };
  const value = raw.trim();
  if (required && !value)
    return { ok: false, code: "INVALID_INPUT", message: `${field} is required` };
  if (value.length > maxChars)
    return {
      ok: false,
      code: "PAYLOAD_TOO_LARGE",
      message: `${field} exceeds ${maxChars} chars`
    };
  return { ok: true, value };
}

export function toPromptBlock(label: string, userText: string, maxChars = 20000): string {
  const clipped = userText.slice(0, maxChars);
  const escaped = clipped
    .replace(/<\/?system>/gi, "")
    .replace(/<\/?assistant>/gi, "");
  return `<${label}>\n${escaped}\n</${label}>`;
}

export function normalizeTerm(term: string): string {
  return term.trim();
}

export type RankedTerm = { term: string; score: number; reasons: string[] };

const STOP_WORDS = new Set([
  "THE", "AND", "FOR", "WITH", "THIS", "THAT", "FROM", "HAVE", "WILL",
  "YOUR", "ABOUT", "THERE", "THEIR", "THEM"
]);

export function rankTerms(input: string): RankedTerm[] {
  const map = new Map<string, RankedTerm>();

  const add = (term: string, score: number, reason: string): void => {
    const key = normalizeTerm(term);
    if (key.length < 2) return;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { term: key, score, reasons: [reason] });
      return;
    }
    existing.score += score;
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
  };

  for (const token of input.match(/\b[A-Z][A-Z0-9/+.-]{1,}\b/g) ?? []) {
    if (!STOP_WORDS.has(token)) add(token, 2.4, "acronym");
  }
  for (const token of input.match(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g) ?? []) {
    add(token, 2.0, "camelCase");
  }
  const freq = new Map<string, number>();
  for (const token of input.match(/\b[A-Za-z][A-Za-z0-9]{2,6}\b/g) ?? []) {
    const key = token.toUpperCase();
    if (!STOP_WORDS.has(key)) freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  for (const [term, count] of freq.entries()) {
    if (count >= 2) add(term, 0.9 + count * 0.2, "frequent");
  }

  return [...map.values()].sort((a, b) => b.score - a.score);
}

export function estimateTermMeaning(term: string, context: string): string {
  const lines = context
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const hitLine = lines.find((line) =>
    line.toLowerCase().includes(term.toLowerCase())
  );
  if (hitLine) {
    return `この会議では「${term}」は次の文脈で使われている可能性があります: ${hitLine}`;
  }
  return `この会議では「${term}」は業務上の重要語として参照されている可能性があります。`;
}
