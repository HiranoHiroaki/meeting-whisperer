// Cloud Run entrypoint: serves the static demo UI (web/) and the four
// meeting-whisperer API functions under /api/* in a single container.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, statSync, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import extractTerms from "../api/extractTerms.js";
import explainTerm from "../api/explainTerm.js";
import generateNotes from "../api/generateNotes.js";
import generateMinutes from "../api/generateMinutes.js";
import transcribeAudio from "../api/transcribeAudio.js";

const PORT = Number(process.env.PORT ?? 8080);
const MAX_BODY_BYTES = 1_000_000;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// dist-server/server -> repo root (works both compiled and via tsx)
const repoRoot = path.resolve(moduleDir, "../..");
const webRoot = existsSync(path.join(repoRoot, "web", "index.html"))
  ? path.join(repoRoot, "web")
  : path.resolve(moduleDir, "../web");

type ApiHandler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

const API_ROUTES: Record<string, ApiHandler> = {
  extractTerms,
  explainTerm,
  generateNotes,
  generateMinutes,
  transcribeAudio
};

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function toVercelResponse(res: ServerResponse): VercelResponse {
  const wrapped = res as VercelResponse;
  wrapped.status = (code: number) => {
    res.statusCode = code;
    return wrapped;
  };
  wrapped.json = (body: unknown) => {
    if (!res.headersSent) res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return wrapped;
  };
  wrapped.send = (body: unknown) => {
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    return wrapped;
  };
  return wrapped;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, route: string): Promise<void> {
  const handler = API_ROUTES[route];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: `Unknown API route: ${route}` } }));
    return;
  }

  const vreq = req as VercelRequest;
  if (req.method?.toUpperCase() === "POST") {
    try {
      (vreq as { body?: unknown }).body = await readJsonBody(req);
    } catch (error) {
      const tooLarge = String(error).includes("PAYLOAD_TOO_LARGE");
      res.statusCode = tooLarge ? 413 : 400;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          error: tooLarge
            ? { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" }
            : { code: "INVALID_JSON", message: "Invalid JSON payload" }
        })
      );
      return;
    }
  }

  const vres = toVercelResponse(res);
  try {
    await handler(vreq, vres);
  } catch (error) {
    console.error(`API handler ${route} failed: ${String(error)}`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: { code: "INTERNAL", message: "Internal server error" } }));
    }
  }
}

function serveStatic(res: ServerResponse, urlPath: string): void {
  // Malformed percent-encoding throws URIError and NUL bytes make fs throw
  // synchronously; both must return 400, never crash the process.
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }
  if (decoded.includes("\0")) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = path.resolve(webRoot, relative);
  if (!filePath.startsWith(webRoot + path.sep) && filePath !== path.join(webRoot, "index.html")) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  let target = filePath;
  if (existsSync(target) && statSync(target).isDirectory()) {
    target = path.join(target, "index.html");
  }
  if (!existsSync(target)) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  const ext = path.extname(target).toLowerCase();
  res.statusCode = 200;
  res.setHeader("content-type", MIME_TYPES[ext] ?? "application/octet-stream");
  res.setHeader("cache-control", ext === ".html" ? "no-cache" : "public, max-age=300");
  const stream = createReadStream(target);
  stream.on("error", (error) => {
    console.error(`static read failed for ${target}: ${String(error)}`);
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  stream.pipe(res);
}

const server = createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/healthz") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const apiMatch = url.match(/^\/api\/([A-Za-z]+)(?:\?.*)?$/);
  if (apiMatch) {
    void handleApi(req, res, apiMatch[1] ?? "");
    return;
  }

  if (req.method?.toUpperCase() !== "GET" && req.method?.toUpperCase() !== "HEAD") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  serveStatic(res, url);
});

server.listen(PORT, () => {
  console.log(`meeting-whisperer listening on :${PORT} (webRoot=${webRoot})`);
});
