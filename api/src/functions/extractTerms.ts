import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { json, rankTerms } from "./shared.js";

type ExtractRequest = {
  text?: string;
};

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

  const ranked = rankTerms(text).slice(0, 5);

  return json(200, ranked.map((t) => ({
    term: t.term,
    summary: `${t.term} は会議文脈で重要な用語である可能性`,
    score: Number(t.score.toFixed(2)),
    reasons: t.reasons
  })));
}

app.http("extractTerms", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "extractTerms",
  handler: extractTerms
});
