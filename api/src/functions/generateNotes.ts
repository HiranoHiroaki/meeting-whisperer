import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { json } from "./shared.js";

type ClickedTerm = string | { term: string; action?: "unknown" | "interest" };

type NotesRequest = {
  clickedTerms?: ClickedTerm[];
  meetingText?: string;
};

function normalizeClickedTerms(items: ClickedTerm[]): { term: string; action: "unknown" | "interest" | "unspecified" }[] {
  const normalized: { term: string; action: "unknown" | "interest" | "unspecified" }[] = [];

  for (const item of items) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) normalized.push({ term: t, action: "unspecified" });
      continue;
    }

    const t = item.term?.trim();
    if (!t) continue;

    const action = item.action === "unknown" || item.action === "interest" ? item.action : "unspecified";
    normalized.push({ term: t, action });
  }

  return normalized;
}

export async function generateNotes(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("generateNotes called");

  let payload: NotesRequest;
  try {
    payload = (await request.json()) as NotesRequest;
  } catch {
    return json(400, { error: { code: "INVALID_JSON", message: "Invalid JSON payload" } });
  }

  const clicked = normalizeClickedTerms(payload.clickedTerms ?? []);
  if (clicked.length === 0) {
    return json(400, { error: { code: "INVALID_INPUT", message: "clickedTerms is required" } });
  }

  const uniqueTerms = [...new Set(clicked.map((x) => x.term))];
  const unknownCount = clicked.filter((x) => x.action === "unknown").length;
  const interestCount = clicked.filter((x) => x.action === "interest").length;

  const notes = `今回の会話で確認した主な用語は ${uniqueTerms.join("、")} です。unknown=${unknownCount}、interest=${interestCount} のシグナルがあり、次回は関連用語を先回り提示すると会議中の聞き返しコストを下げられる可能性があります。`;

  return json(200, {
    notes,
    stats: {
      uniqueTerms: uniqueTerms.length,
      unknownCount,
      interestCount
    }
  });
}

app.http("generateNotes", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "generateNotes",
  handler: generateNotes
});
