import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { estimateTermMeaning, json } from "./shared.js";

type ExplainRequest = {
  term?: string;
  context?: string;
};

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

  const detail = estimateTermMeaning(term, payload.context ?? "");

  return json(200, {
    detail,
    style: "estimated",
    caution: "断定ではなく推定として提示"
  });
}

app.http("explainTerm", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "explainTerm",
  handler: explainTerm
});
