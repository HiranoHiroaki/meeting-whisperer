export function resolveDictionaryProfile(selectedSample) {
  const selected = String(selectedSample ?? "");
  if (selected.includes("system-development")) return "system_development";
  if (selected.includes("management")) return "management";
  if (selected.includes("manufacturing")) return "manufacturing";
  if (selected.includes("fashion")) return "fashion";
  if (selected.includes("welfare-services")) return "welfare_services";
  if (selected.includes("healthcare")) return "healthcare";
  if (selected.includes("homelab")) return "homelab";
  if (selected.includes("social-slang")) return "social_slang";
  return "system_development";
}

export function resolveMeetingDomain(selectedSample) {
  const selected = String(selectedSample ?? "");
  if (selected.includes("system-development")) return "ITシステム開発";
  if (selected.includes("management")) return "経営";
  if (selected.includes("manufacturing")) return "製造業";
  if (selected.includes("fashion")) return "服飾";
  if (selected.includes("welfare-services")) return "福祉サービス";
  if (selected.includes("healthcare")) return "看護・医療";
  if (selected.includes("homelab")) return "自作PC・ホームラボ";
  if (selected.includes("social-slang")) return "雑談・界隈用語";
  return "業務";
}

function containsTermInMeetingText(text, term) {
  const body = String(text ?? "");
  const t = String(term ?? "").trim();
  if (!body || !t) return false;

  if (/^[A-Za-z0-9/+._#-]+$/.test(t)) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i");
    return pattern.test(body);
  }

  return body.includes(t);
}

function toPersonalTerms(personalDictionary, meetingText) {
  if (!personalDictionary || typeof personalDictionary !== "object") return [];
  const rows = Object.values(personalDictionary)
    .filter((x) => x && typeof x === "object")
    .map((row) => {
      const term = typeof row.term === "string" ? row.term.trim() : "";
      if (!term) return null;
      const summary =
        typeof row.summary === "string" && row.summary.trim()
          ? row.summary.trim()
          : `${term} はユーザーの個人辞書に登録されています。`;
      const memo = typeof row.memo === "string" ? row.memo.trim() : "";
      return { term, summary, memo };
    })
    .filter(Boolean)
    .filter((row) => containsTermInMeetingText(meetingText, row.term))
    .slice(0, 200);
  return rows;
}

export function buildExtractRequestPayload(text, { selectedSample, includeDebug, personalDictionary }) {
  return {
    text,
    dictionaryProfile: resolveDictionaryProfile(selectedSample),
    meetingDomain: resolveMeetingDomain(selectedSample),
    useDispatcher: true,
    includeDebug: Boolean(includeDebug),
    personalTerms: toPersonalTerms(personalDictionary, text),
  };
}

export function parseExtractPayload(payload) {
  const source = String(payload?.source ?? "-");
  const dictionary = payload?.dictionary ?? null;
  const dispatcherPolicy = payload?.dispatcherPolicy ?? null;
  const dictionaryMode =
    typeof payload?.dictionaryMode === "string" ? payload.dictionaryMode : "-";
  const dictionaryProfile =
    typeof payload?.dictionaryProfile === "string" ? payload.dictionaryProfile : null;
  const dispatcherBypassed =
    typeof payload?.dispatcherBypassed === "boolean" ? payload.dispatcherBypassed : null;

  const rows = Array.isArray(payload?.terms) ? payload.terms : Array.isArray(payload) ? payload : [];
  const terms = rows
    .map((x) => {
      const term = typeof x?.term === "string" ? x.term.trim() : "";
      if (!term) return null;

      const reasons = Array.isArray(x?.reasons)
        ? x.reasons.filter((r) => typeof r === "string")
        : [];

      const dispatcher =
        x?.dispatcher && typeof x.dispatcher === "object"
          ? {
              matchedText: typeof x.dispatcher.matchedText === "string" ? x.dispatcher.matchedText : "",
              score: typeof x.dispatcher.score === "number" ? x.dispatcher.score : null,
              reason: typeof x.dispatcher.reason === "string" ? x.dispatcher.reason : null,
              reasons: Array.isArray(x.dispatcher.reasons)
                ? x.dispatcher.reasons.filter((r) => typeof r === "string")
                : [],
              hits: typeof x.dispatcher.hits === "number" ? x.dispatcher.hits : null,
              category: typeof x.dispatcher.category === "string" ? x.dispatcher.category : null,
              file: typeof x.dispatcher.file === "string" ? x.dispatcher.file : null,
              layer: typeof x.dispatcher.layer === "string" ? x.dispatcher.layer : null,
            }
          : null;

      return {
        term,
        summary: typeof x?.summary === "string" ? x.summary : "",
        score: typeof x?.score === "number" ? x.score : null,
        confidence: typeof x?.confidence === "number" ? x.confidence : null,
        origin: typeof x?.origin === "string" ? x.origin : null,
        source: typeof x?.source === "string" ? x.source : null,
        profile: typeof x?.profile === "string" ? x.profile : null,
        reasons,
        dispatcher,
      };
    })
    .filter(Boolean);

  return { source, dictionary, dispatcherPolicy, dictionaryMode, dictionaryProfile, dispatcherBypassed, terms };
}

export function buildRoutesFromExtract(terms, source) {
  const routes = {};
  for (const row of terms) {
    const dispatcher = row.dispatcher ?? null;
    routes[row.term] = {
      extract: {
        source,
        matchedText: dispatcher?.matchedText ?? null,
        score: dispatcher?.score ?? row.score ?? null,
        reason: dispatcher?.reason ?? null,
        reasons: dispatcher?.reasons?.length ? dispatcher.reasons : row.reasons,
        hits: dispatcher?.hits ?? null,
        category: dispatcher?.category ?? null,
        file: dispatcher?.file ?? null,
        layer: dispatcher?.layer ?? null,
        origin: row.origin ?? null,
        profile: row.profile ?? null,
        confidence: row.confidence ?? null,
      },
      explain: null,
    };
  }
  return routes;
}
