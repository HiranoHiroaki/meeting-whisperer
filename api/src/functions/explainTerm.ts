import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { chatWithAzureOpenAi, getConfiguredAiSource, hasAzureOpenAiConfig, parseJsonFromText } from "./aiClient.js";
import { estimateTermMeaning, json } from "./shared.js";

type ExplainRequest = {
  term?: string;
  context?: string;
};

function isMetaResponse(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith("ユーザーは")) return true;
  if (t.includes("要件")) return true;
  if (t.includes("入力情報")) return true;
  if (t.includes("JSONオブジェクト")) return true;
  return false;
}

export async function explainTerm(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("explainTerm called");

  let payload: ExplainRequest;
  try {
    payload = (await request.json()) as ExplainRequest;
  } catch {
    return json(400, { error: { code: "INVALID_JSON", message: "Invalid JSON payload" } });
  }

  const term = payload.term?.trim();
  if (!term) {
    return json(400, { error: { code: "INVALID_INPUT", message: "term is required" } });
  }

  if (hasAzureOpenAiConfig()) {
    try {
      const detail = await chatWithAzureOpenAi(
        [
          {
            role: "system",
            content:
              "会議用語の補助説明を返す。断定せず『可能性があります』を含むこと。必ずJSONオブジェクトのみ返し、形式は {\"detail\":\"...\"}。"
          },
          {
            role: "user",
            content: `用語: ${term}\\n会議ログ:\\n${payload.context ?? ""}\\n\\nこの会議文脈での意味を短く説明してください。`
          }
        ],
        context,
        { temperature: 0.2, maxTokens: 220, responseFormatJsonObject: true, disableThinking: true }
      );

      const parsed = parseJsonFromText<Record<string, unknown>>(detail);
      const cleaned =
        parsed && typeof parsed.detail === "string" ? parsed.detail.trim() : detail.trim();
      if (cleaned.length > 0 && !isMetaResponse(cleaned)) {
        return json(200, {
          detail: cleaned,
          style: "estimated",
          caution: "断定ではなく推定として提示",
          source: getConfiguredAiSource() ?? "ai"
        });
      }
    } catch (error) {
      context.warn(`explainTerm fallback: ${String(error)}`);
    }
  }

  const detail = estimateTermMeaning(term, payload.context ?? "");

  return json(200, {
    detail,
    style: "estimated",
    caution: "断定ではなく推定として提示",
    source: "heuristic"
  });
}

app.http("explainTerm", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "explainTerm",
  handler: explainTerm
});
