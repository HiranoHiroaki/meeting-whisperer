import { HttpResponseInit } from "@azure/functions";

export function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    }
  };
}

export function normalizeTerm(term: string): string {
  return term.trim();
}

export type RankedTerm = {
  term: string;
  score: number;
  reasons: string[];
};

const STOP_WORDS = new Set([
  "THE", "AND", "FOR", "WITH", "THIS", "THAT", "FROM", "HAVE", "WILL", "YOUR", "ABOUT", "THERE", "THEIR", "THEM"
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
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
  };

  const acronyms = input.match(/\b[A-Z][A-Z0-9/+.-]{1,}\b/g) ?? [];
  for (const token of acronyms) {
    if (!STOP_WORDS.has(token)) add(token, 2.4, "acronym");
  }

  const camelCases = input.match(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g) ?? [];
  for (const token of camelCases) {
    add(token, 2.0, "camelCase");
  }

  const shortMixed = input.match(/\b[A-Za-z][A-Za-z0-9]{2,6}\b/g) ?? [];
  const freq = new Map<string, number>();
  for (const token of shortMixed) {
    const key = token.toUpperCase();
    if (STOP_WORDS.has(key)) continue;
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  for (const [term, count] of freq.entries()) {
    if (count >= 2) {
      add(term, 0.9 + count * 0.2, "frequent");
    }
  }

  return [...map.values()].sort((a, b) => b.score - a.score);
}

export function estimateTermMeaning(term: string, context: string): string {
  const lines = context
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const hitLine = lines.find((line) => line.toLowerCase().includes(term.toLowerCase()));

  if (hitLine) {
    return `この会議では「${term}」は次の文脈で使われている可能性があります: ${hitLine}`;
  }

  return `この会議では「${term}」は業務上の重要語として参照されている可能性があります。`;
}
