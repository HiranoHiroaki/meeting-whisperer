import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { chatWithAzureOpenAi, getConfiguredAiSource, hasAzureOpenAiConfig, parseJsonFromText } from "./aiClient.js";
import { json } from "./shared.js";

type ClickedTerm = string | { term: string; action?: "unknown" | "interest" };

type NotesRequest = {
  clickedTerms?: ClickedTerm[];
  meetingText?: string;
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

  if (hasAzureOpenAiConfig()) {
    try {
      const clickedText = clicked.map((x) => `${x.term} (${x.action})`).join(", ");
      const aiNotes = await chatWithAzureOpenAi(
        [
          {
            role: "system",
            content:
              "会議後の個人向けキャッチアップ要約を返す。3文以内・日本語。必ずJSONオブジェクトのみ返し、形式は {\"notes\":\"...\"}。"
          },
          {
            role: "user",
            content: `clickedTerms: ${clickedText}\\nmeetingText:\\n${payload.meetingText ?? ""}\\n\\n今日の知ったかまとめを作成してください。`
          }
        ],
        context,
        { temperature: 0.3, maxTokens: 260, responseFormatJsonObject: true, disableThinking: true }
      );

      const parsed = parseJsonFromText<Record<string, unknown>>(aiNotes);
      const finalNotes =
        parsed && typeof parsed.notes === "string" ? parsed.notes.trim() : aiNotes.trim();

      if (finalNotes && !isMetaResponse(finalNotes)) {
        return json(200, {
          notes: finalNotes,
          stats: {
            uniqueTerms: uniqueTerms.length,
            unknownCount,
            interestCount
          },
          source: getConfiguredAiSource() ?? "ai"
        });
      }
    } catch (error) {
      context.warn(`generateNotes fallback: ${String(error)}`);
    }
  }

  const notes = `今回の会話で確認した主な用語は ${uniqueTerms.join("、")} です。unknown=${unknownCount}、interest=${interestCount} のシグナルがあり、次回は関連用語を先回り提示すると会議中の聞き返しコストを下げられる可能性があります。`;

  return json(200, {
    notes,
    stats: {
      uniqueTerms: uniqueTerms.length,
      unknownCount,
      interestCount
    },
    source: "heuristic"
  });
}

app.http("generateNotes", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "generateNotes",
  handler: generateNotes
});
