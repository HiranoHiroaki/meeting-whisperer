import { parseJsonFromText } from "./aiClient.js";

const META_PATTERNS = [
  /^ユーザーは/,
  /^要件[：:]/,
  /^制約条件[：:]/,
  /^入力情報[：:]/,
  /^形式[：:]/,
  /^出力形式[：:]/,
  /^json/i,
  /JSONオブジェクト/,
  /clickedTerms/i,
  /meetingText/i,
  /以下の通り/,
  /補助説明を求めています/,
  /作成してください/,
];

function isMetaLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return META_PATTERNS.some((p) => p.test(t));
}

function stripCodeFences(text: string): string {
  return text
    .replace(/```json\s*([\s\S]*?)\s*```/gi, "$1")
    .replace(/```\s*([\s\S]*?)\s*```/g, "$1")
    .trim();
}

function normalizeText(text: string): string {
  return stripCodeFences(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function ensurePossibilityPhrase(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (t.includes("可能性があります")) return t;
  if (/[。！？!?]$/.test(t)) return `${t.slice(0, -1)}可能性があります。`;
  return `${t} である可能性があります。`;
}

function shorten(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function collectUsableLines(raw: string): string[] {
  return normalizeText(raw)
    .split(/\n+/)
    .map((x) => x.replace(/^[-*]\s*/, "").replace(/^\d+[.)、]\s*/, "").trim())
    .filter((x) => x.length > 0)
    .filter((x) => !isMetaLine(x));
}

export function isMetaResponseText(text: string): boolean {
  return collectUsableLines(text).length === 0;
}

export function postProcessExplainFromAi(raw: string, term: string): string | null {
  const parsed = parseJsonFromText<Record<string, unknown>>(raw);
  const jsonDetail =
    parsed && typeof parsed.detail === "string" ? parsed.detail.trim() : "";
  if (jsonDetail && !isMetaResponseText(jsonDetail))
    return shorten(ensurePossibilityPhrase(jsonDetail), 220);

  const lines = collectUsableLines(raw);
  const termLine = lines.find(
    (line) => line.toLowerCase().includes(term.toLowerCase()) && line.length >= 10
  );
  if (termLine) return shorten(ensurePossibilityPhrase(termLine), 220);

  const sentence = splitSentences(lines.join("\n")).find((x) => x.length >= 12);
  if (!sentence) return null;

  if (sentence.includes(term))
    return shorten(ensurePossibilityPhrase(sentence), 220);

  return shorten(
    `この会議では「${term}」は ${sentence.replace(/[。！？!?]$/, "")} を指す可能性があります。`,
    220
  );
}

export function postProcessNotesFromAi(
  raw: string,
  clickedTerms: string[]
): string | null {
  const parsed = parseJsonFromText<Record<string, unknown>>(raw);
  const jsonNotes =
    parsed && typeof parsed.notes === "string" ? parsed.notes.trim() : "";
  if (jsonNotes && !isMetaResponseText(jsonNotes)) return shorten(jsonNotes, 360);

  const lines = collectUsableLines(raw);
  const sentences = splitSentences(lines.join("\n"))
    .filter((s) => s.length >= 14)
    .filter((s) => !/^(1|2|3|4|5)\s*$/.test(s));

  if (sentences.length === 0) return null;

  const picked = sentences.slice(0, 3).join(" ");
  const hasTerm = clickedTerms.some((t) =>
    picked.toLowerCase().includes(t.toLowerCase())
  );
  if (hasTerm) return shorten(picked, 360);

  const tail =
    clickedTerms.length > 0
      ? `主な確認語は ${clickedTerms.slice(0, 5).join("、")} です。`
      : "";
  return shorten(`${picked} ${tail}`.trim(), 360);
}
