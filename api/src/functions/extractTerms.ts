import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { chatWithAzureOpenAi, getConfiguredAiSource, hasAzureOpenAiConfig, parseJsonFromText } from "./aiClient.js";
import { json, rankTerms } from "./shared.js";

type ExtractRequest = {
  text?: string;
};

type ExtractedTerm = {
  term: string;
  summary?: string;
  score?: number;
  reasons?: string[];
};

function sanitizeExtractedTerms(items: unknown): ExtractedTerm[] {
  let rows: unknown[] = [];
  if (Array.isArray(items)) {
    rows = items;
  } else if (
    items &&
    typeof items === "object" &&
    Array.isArray((items as Record<string, unknown>).terms)
  ) {
    rows = (items as Record<string, unknown>).terms as unknown[];
  } else {
    return [];
  }

  const cleaned: ExtractedTerm[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as Record<string, unknown>;
    const term = typeof row.term === "string" ? row.term.trim() : "";
    if (!term) {
      continue;
    }

    const summary =
      typeof row.summary === "string" && row.summary.trim()
        ? row.summary.trim()
        : `${term} は会議文脈で重要な用語である可能性`;

    const score = typeof row.score === "number" ? row.score : 0.7;
    const reasons =
      Array.isArray(row.reasons) && row.reasons.every((x) => typeof x === "string")
        ? (row.reasons as string[]).slice(0, 3)
        : ["domain_specific"];

    cleaned.push({
      term,
      summary,
      score: Number(score.toFixed(2)),
      reasons
    });
  }

  const uniq = new Map<string, ExtractedTerm>();
  for (const row of cleaned) {
    if (!uniq.has(row.term)) {
      uniq.set(row.term, row);
    }
  }

  return [...uniq.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
}

function parseTermsFromReasoningText(text: string): ExtractedTerm[] {
  const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const out: ExtractedTerm[] = [];

  for (const line of lines) {
    const m = line.match(/^\d+[.)、]\s*([A-Za-z0-9+/.#_-]{2,}|[一-龯ぁ-んァ-ヶー]{2,})\s*[-:：]\s*(.+)$/);
    if (!m) continue;
    const term = m[1].trim();
    const desc = m[2].trim();
    if (!term || !desc) continue;

    out.push({
      term,
      summary: desc.includes("可能性") ? desc : `${desc} である可能性があります。`,
      score: 0.8,
      reasons: ["reasoning_parse"]
    });
  }

  const uniq = new Map<string, ExtractedTerm>();
  for (const row of out) {
    if (!uniq.has(row.term)) uniq.set(row.term, row);
  }
  return [...uniq.values()].slice(0, 5);
}

export async function extractTerms(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("extractTerms called");

  let payload: ExtractRequest;
  try {
    payload = (await request.json()) as ExtractRequest;
  } catch {
    return json(400, { error: { code: "INVALID_JSON", message: "Invalid JSON payload" } });
  }

  const text = payload.text?.trim();
  if (!text) {
    return json(400, { error: { code: "INVALID_INPUT", message: "text is required" } });
  }

  if (hasAzureOpenAiConfig()) {
    try {
      const aiText = await chatWithAzureOpenAi(
        [
          {
            role: "system",
            content:
              "会議ログから未知語候補を最大5件抽出してください。断定を避けてください。必ずJSONオブジェクトのみ返し、形式は {\"terms\":[{\"term\":\"...\",\"summary\":\"...可能性があります\",\"score\":0.0,\"reasons\":[\"...\"]}]} とすること。"
          },
          {
            role: "user",
            content: `次の会議ログから未知語候補を抽出してください:\\n\\n${text}`
          }
        ],
        context,
        { temperature: 0.1, maxTokens: 600, responseFormatJsonObject: true, disableThinking: true }
      );

      const parsed = parseJsonFromText<unknown>(aiText);
      let aiTerms = sanitizeExtractedTerms(parsed);
      if (aiTerms.length === 0) {
        aiTerms = parseTermsFromReasoningText(aiText);
      }
      if (aiTerms.length > 0) {
        return json(200, {
          source: getConfiguredAiSource() ?? "ai",
          terms: aiTerms
        });
      }

      context.warn(`extractTerms ai parse yielded 0 items. aiText head=${aiText.substring(0, 260)}`);
    } catch (error) {
      context.warn(`extractTerms fallback: ${String(error)}`);
    }
  }

  const ranked = rankTerms(text).slice(0, 5);

  return json(200, {
    source: "heuristic",
    terms: ranked.map((t) => ({
      term: t.term,
      summary: `${t.term} は会議文脈で重要な用語である可能性`,
      score: Number(t.score.toFixed(2)),
      reasons: t.reasons
    }))
  });
}

app.http("extractTerms", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "extractTerms",
  handler: extractTerms
});
