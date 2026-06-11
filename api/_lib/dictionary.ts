import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type DictionaryLayer = "fixed" | "project_local";
export type DictionaryMatchType = "exact" | "alias" | "acronym";
export type MatchReason = "term" | "alias" | "uppercase" | "context";

export type DictionaryEntry = {
  term: string;
  aliases: string[];
  category?: string;
  short: string;
  long?: string;
  tags: string[];
  confidence: number;
  source: string;
  file: string;
  layer: DictionaryLayer;
};

export type DictionaryHit = {
  entry: DictionaryEntry;
  matchType: DictionaryMatchType;
};

export type DispatchMatchResult = {
  entry: DictionaryEntry;
  matchedText: string;
  score: number;
  reason: MatchReason;
  reasons: MatchReason[];
  hits: number;
};

export type DispatchOptions = {
  minScore?: number;
  maxPerLine?: number;
  maxPerCategory?: number;
  maxTotal?: number;
};

export type FixedDictionaryProfile =
  | "system_development"
  | "management"
  | "manufacturing"
  | "fashion"
  | "welfare_services"
  | "healthcare"
  | "homelab"
  | "social_slang";

export type FixedMatchOptions = {
  files?: string[];
  maxTotal?: number;
};

type DispatcherPolicy = {
  crossDictionary: boolean;
  scoring: {
    exactTerm: number;
    alias: number;
    uppercaseFloor: number;
    contextBonus: number;
    shortTokenPenalty: number;
    genericWordPenalty: number;
    repeatedHitBoostPerHit: number;
    repeatedHitBoostMax: number;
  };
  thresholds: {
    minScore: number;
    maxPerLine: number;
    maxPerCategoryPerLine: number;
    maxTotal: number;
  };
};

type RawDictionaryEntry = {
  term?: unknown;
  aliases?: unknown;
  category?: unknown;
  short?: unknown;
  long?: unknown;
  confidence?: unknown;
  source?: unknown;
  tags?: unknown;
};

type LoadedSource = {
  dir: string;
  files: string[];
};

type DictionaryCache = {
  loadedAtMs: number;
  entries: DictionaryEntry[];
  exactMap: Map<string, DictionaryEntry>;
  aliasMap: Map<string, DictionaryEntry>;
  acronymMap: Map<string, DictionaryEntry>;
  sources: LoadedSource[];
};

const ASSET_DICTIONARY_FILES = [
  "it_seed_dictionary.json",
  "business_seed_dictionary.json",
  "medical_seed_dictionary.json",
  "fashion_seed_dictionary.json",
  "pc_otaku_seed_dictionary.json",
  "gyaru_seed_dictionary.json",
  "manufacturing_seed_dictionary.json"
] as const;

const LOCAL_DICTIONARY_FILES = [
  "core-business.json",
  "core-it.json",
  "core-ai.json",
  "cloud-azure.json",
  "project-local.json"
] as const;

const DEFAULT_CATEGORY_BY_SEED_FILE: Record<string, string> = {
  "it_seed_dictionary.json": "it",
  "business_seed_dictionary.json": "business",
  "medical_seed_dictionary.json": "medical",
  "fashion_seed_dictionary.json": "fashion",
  "pc_otaku_seed_dictionary.json": "pc_otaku",
  "gyaru_seed_dictionary.json": "gyaru",
  "manufacturing_seed_dictionary.json": "manufacturing"
};

const FIXED_PROFILE_FILES: Record<FixedDictionaryProfile, readonly string[]> = {
  system_development: [
    "it_seed_dictionary.json",
    "business_seed_dictionary.json",
    "core-it.json",
    "core-business.json",
    "core-ai.json",
    "cloud-azure.json",
    "project-local.json"
  ],
  management: [
    "business_seed_dictionary.json",
    "it_seed_dictionary.json",
    "core-business.json",
    "core-it.json",
    "core-ai.json",
    "cloud-azure.json",
    "project-local.json"
  ],
  manufacturing: [
    "manufacturing_seed_dictionary.json",
    "it_seed_dictionary.json",
    "business_seed_dictionary.json",
    "core-it.json",
    "core-business.json",
    "project-local.json"
  ],
  fashion: [
    "fashion_seed_dictionary.json",
    "business_seed_dictionary.json",
    "it_seed_dictionary.json",
    "core-business.json",
    "core-it.json",
    "project-local.json"
  ],
  welfare_services: [
    "medical_seed_dictionary.json",
    "business_seed_dictionary.json",
    "it_seed_dictionary.json",
    "core-business.json",
    "core-it.json",
    "project-local.json"
  ],
  healthcare: [
    "medical_seed_dictionary.json",
    "it_seed_dictionary.json",
    "business_seed_dictionary.json",
    "core-it.json",
    "core-business.json",
    "project-local.json"
  ],
  homelab: [
    "pc_otaku_seed_dictionary.json",
    "it_seed_dictionary.json",
    "core-it.json",
    "core-ai.json",
    "project-local.json"
  ],
  social_slang: [
    "gyaru_seed_dictionary.json",
    "business_seed_dictionary.json",
    "it_seed_dictionary.json",
    "core-business.json",
    "core-it.json",
    "project-local.json"
  ]
};

const GENERIC_WORDS = new Set([
  "data", "info", "user", "users", "input", "output", "json", "system", "meeting", "project", "issue",
  "対応", "確認", "情報", "入力", "出力", "形式", "要件", "会議", "案件", "課題", "今日", "今回", "内容"
]);

const CACHE_TTL_MS = 3000;
const DEFAULT_MIN_SCORE = 80;
const DEFAULT_MAX_PER_LINE = 3;
const DEFAULT_MAX_PER_CATEGORY = 2;
const DEFAULT_MAX_TOTAL = 5;

const SCORE_WEIGHTS = {
  exactTerm: 100,
  alias: 90,
  uppercaseFloor: 85,
  contextBonus: 10,
  shortTokenPenalty: -30,
  genericWordPenalty: -40,
  repeatedHitBoostPerHit: 2,
  repeatedHitBoostMax: 6
} as const;

let dictionaryCache: DictionaryCache | null = null;

function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeAcronymKey(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function isAcronymLike(value: string): boolean {
  const t = value.trim();
  return /^[A-Z0-9/+._-]{2,}$/.test(t);
}

function isAsciiToken(value: string): boolean {
  return /^[A-Za-z0-9/+._#-]+$/.test(value);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string): boolean {
  if (!text || !term) return false;

  if (isAsciiToken(term)) {
    const escaped = escapeRegExp(term);
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i");
    return pattern.test(text);
  }

  return text.includes(term);
}

function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;

  if (isAsciiToken(term)) {
    const escaped = escapeRegExp(term);
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "gi");
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  let hits = 0;
  let index = 0;
  while (index >= 0) {
    index = text.indexOf(term, index);
    if (index < 0) break;
    hits += 1;
    index += term.length;
  }
  return hits;
}

function findFirstOccurrence(text: string, term: string): number {
  if (!text || !term) return Number.MAX_SAFE_INTEGER;

  if (isAsciiToken(term)) {
    const escaped = escapeRegExp(term);
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i");
    const matched = pattern.exec(text);
    return matched && typeof matched.index === "number" ? matched.index : Number.MAX_SAFE_INTEGER;
  }

  const idx = text.indexOf(term);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function parseObjectStyleDictionary(payload: Record<string, unknown>): RawDictionaryEntry[] {
  const out: RawDictionaryEntry[] = [];
  for (const [termKey, rawValue] of Object.entries(payload)) {
    if (!rawValue || typeof rawValue !== "object") continue;
    const row = rawValue as Record<string, unknown>;
    out.push({
      term: typeof row.term === "string" && row.term.trim().length > 0 ? row.term : termKey,
      aliases: row.aliases,
      category: row.category,
      short: row.short,
      long: row.long,
      confidence: row.confidence,
      source: row.source,
      tags: row.tags
    });
  }
  return out;
}

function parseRawEntries(filePath: string): RawDictionaryEntry[] {
  const rawText = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(rawText) as unknown;

  if (Array.isArray(parsed)) {
    return parsed.filter((x) => typeof x === "object" && x !== null) as RawDictionaryEntry[];
  }

  if (parsed && typeof parsed === "object") {
    return parseObjectStyleDictionary(parsed as Record<string, unknown>);
  }

  return [];
}

function toDictionaryEntry(
  file: string,
  raw: RawDictionaryEntry,
  layer: DictionaryLayer,
  defaultSource: string,
  defaultCategory?: string
): DictionaryEntry | null {
  const term = typeof raw.term === "string" ? raw.term.trim() : "";
  if (!term) return null;

  const short =
    typeof raw.short === "string" && raw.short.trim().length > 0
      ? raw.short.trim()
      : `${term} に関する会議向けの基礎用語です。`;

  const long = typeof raw.long === "string" && raw.long.trim().length > 0 ? raw.long.trim() : undefined;
  const category =
    typeof raw.category === "string" && raw.category.trim().length > 0
      ? raw.category.trim()
      : defaultCategory;
  const confidence = typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.9;
  const source = typeof raw.source === "string" && raw.source.trim().length > 0 ? raw.source.trim() : defaultSource;
  const aliases = toStringArray(raw.aliases);
  const tags = toStringArray(raw.tags);

  return {
    term,
    aliases,
    category,
    short,
    long,
    tags,
    confidence,
    source,
    file,
    layer
  };
}

function resolveCandidateDir(relativePath: string): string | null {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), relativePath),
    path.resolve(moduleDir, `../../../${relativePath}`),
    path.resolve(moduleDir, `../../${relativePath}`),
    path.resolve(moduleDir, `../../../../${relativePath}`),
    path.resolve(moduleDir, `../../../../../${relativePath}`)
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function loadFromDirectory(
  dir: string | null,
  files: readonly string[],
  layer: DictionaryLayer,
  defaultSource: string,
  categoryMap?: Record<string, string>
): { entries: DictionaryEntry[]; source: LoadedSource | null } {
  if (!dir) {
    return { entries: [], source: null };
  }

  const loadedFiles: string[] = [];
  const entries: DictionaryEntry[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    if (!existsSync(filePath)) continue;

    try {
      const rows = parseRawEntries(filePath);
      for (const row of rows) {
        const entry = toDictionaryEntry(file, row, layer, defaultSource, categoryMap?.[file]);
        if (entry) entries.push(entry);
      }
      loadedFiles.push(file);
    } catch {
      // Keep runtime resilient during hackathon demos.
    }
  }

  if (loadedFiles.length === 0) {
    return { entries: [], source: null };
  }

  return {
    entries,
    source: {
      dir,
      files: loadedFiles
    }
  };
}

function buildLookupMaps(entries: DictionaryEntry[]): {
  exactMap: Map<string, DictionaryEntry>;
  aliasMap: Map<string, DictionaryEntry>;
  acronymMap: Map<string, DictionaryEntry>;
} {
  const exactMap = new Map<string, DictionaryEntry>();
  const aliasMap = new Map<string, DictionaryEntry>();
  const acronymMap = new Map<string, DictionaryEntry>();

  for (const entry of entries) {
    const exactKey = normalizeLookupKey(entry.term);
    exactMap.set(exactKey, entry);

    for (const alias of entry.aliases) {
      const aliasKey = normalizeLookupKey(alias);
      if (aliasKey) aliasMap.set(aliasKey, entry);
    }

    if (isAcronymLike(entry.term)) {
      acronymMap.set(normalizeAcronymKey(entry.term), entry);
    }

    for (const alias of entry.aliases) {
      if (isAcronymLike(alias)) {
        acronymMap.set(normalizeAcronymKey(alias), entry);
      }
    }
  }

  return { exactMap, aliasMap, acronymMap };
}

function ensureLoaded(): DictionaryCache {
  if (dictionaryCache && Date.now() - dictionaryCache.loadedAtMs < CACHE_TTL_MS) {
    return dictionaryCache;
  }

  const entries: DictionaryEntry[] = [];
  const sources: LoadedSource[] = [];

  // 1) seed dictionaries in /assets/dictionary (base layer)
  const assetDir = resolveCandidateDir("assets/dictionary");
  const seedLoaded = loadFromDirectory(
    assetDir,
    ASSET_DICTIONARY_FILES,
    "fixed",
    "seed",
    DEFAULT_CATEGORY_BY_SEED_FILE
  );
  entries.push(...seedLoaded.entries);
  if (seedLoaded.source) sources.push(seedLoaded.source);

  // 2) local dictionaries in /api/dict (override layer)
  const localDir = resolveCandidateDir("api/dict") ?? resolveCandidateDir("dict");
  const localLoaded = loadFromDirectory(localDir, LOCAL_DICTIONARY_FILES, "fixed", "local_fixed");
  for (const entry of localLoaded.entries) {
    if (entry.file === "project-local.json") {
      entry.layer = "project_local";
    }
  }
  entries.push(...localLoaded.entries);
  if (localLoaded.source) sources.push(localLoaded.source);

  const { exactMap, aliasMap, acronymMap } = buildLookupMaps(entries);

  dictionaryCache = {
    loadedAtMs: Date.now(),
    entries,
    exactMap,
    aliasMap,
    acronymMap,
    sources
  };

  return dictionaryCache;
}

function hasContextSignal(lineLower: string, entry: DictionaryEntry): boolean {
  if (entry.category && lineLower.includes(entry.category.toLowerCase())) {
    return true;
  }

  for (const tag of entry.tags) {
    if (lineLower.includes(tag.toLowerCase())) {
      return true;
    }
  }

  return false;
}

function calcBaseScore(entry: DictionaryEntry, matchedText: string, isAlias: boolean, lineLower: string): {
  score: number;
  reasons: MatchReason[];
} {
  let score: number = isAlias ? SCORE_WEIGHTS.alias : SCORE_WEIGHTS.exactTerm;
  const reasons: MatchReason[] = [isAlias ? "alias" : "term"];

  if (isAcronymLike(matchedText)) {
    score = Math.max(score, SCORE_WEIGHTS.uppercaseFloor);
    reasons.push("uppercase");
  }

  if (hasContextSignal(lineLower, entry)) {
    score += SCORE_WEIGHTS.contextBonus;
    reasons.push("context");
  }

  const termLen = entry.term.trim().length;
  if (termLen <= 2 && !isAcronymLike(entry.term)) {
    score += SCORE_WEIGHTS.shortTokenPenalty;
  }

  if (GENERIC_WORDS.has(entry.term.trim().toLowerCase())) {
    score += SCORE_WEIGHTS.genericWordPenalty;
  }

  return { score, reasons };
}

function dedupeLineResults<T extends DispatchMatchResult>(results: T[]): T[] {
  const byTerm = new Map<string, T>();

  for (const row of results) {
    const key = normalizeLookupKey(row.entry.term);
    const existing = byTerm.get(key);
    if (!existing) {
      byTerm.set(key, row);
      continue;
    }

    if (row.score > existing.score) {
      byTerm.set(key, row);
      continue;
    }

    if (row.score === existing.score && row.reason === "term" && existing.reason !== "term") {
      byTerm.set(key, row);
    }
  }

  return [...byTerm.values()];
}

function scoreLine(line: string, entries: DictionaryEntry[], options: Required<DispatchOptions>): DispatchMatchResult[] {
  type InternalResult = DispatchMatchResult & { pos: number };
  const results: InternalResult[] = [];
  const lineLower = line.toLowerCase();

  for (const entry of entries) {
    const candidates: Array<{ text: string; alias: boolean }> = [
      { text: entry.term, alias: false },
      ...entry.aliases.map((x) => ({ text: x, alias: true }))
    ];

    for (const candidate of candidates) {
      const c = candidate.text.trim();
      if (!c || c.length < 2) continue;
      if (!containsTerm(line, c)) continue;

      const scored = calcBaseScore(entry, c, candidate.alias, lineLower);
      const pos = lineLower.indexOf(c.toLowerCase());
      results.push({
        entry,
        matchedText: c,
        score: scored.score,
        reason: scored.reasons[0],
        reasons: scored.reasons,
        hits: 1,
        pos: pos >= 0 ? pos : Number.MAX_SAFE_INTEGER
      });
    }
  }

  const deduped = dedupeLineResults(results)
    .filter((x) => x.score >= options.minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.pos !== b.pos) return a.pos - b.pos;
      if (a.reason !== b.reason) {
        return a.reason === "term" ? -1 : 1;
      }
      return a.entry.term.localeCompare(b.entry.term);
    });

  const categoryCount = new Map<string, number>();
  const filtered: InternalResult[] = [];

  for (const row of deduped) {
    const key = row.entry.category ?? "_";
    const used = categoryCount.get(key) ?? 0;
    if (used >= options.maxPerCategory) continue;
    filtered.push(row);
    categoryCount.set(key, used + 1);
    if (filtered.length >= options.maxPerLine) break;
  }

  return filtered.map(({ pos, ...rest }) => rest);
}

export function reloadDictionaries(): void {
  dictionaryCache = null;
}

export function getDictionaryStats(): {
  sourceDirs: string[];
  files: string[];
  totalEntries: number;
  fixedEntries: number;
  projectLocalEntries: number;
  categories: string[];
} {
  const cache = ensureLoaded();
  const fixedEntries = cache.entries.filter((x) => x.layer === "fixed").length;
  const projectLocalEntries = cache.entries.filter((x) => x.layer === "project_local").length;
  const categories = [...new Set(cache.entries.map((x) => x.category).filter((x): x is string => Boolean(x)))].sort();

  return {
    sourceDirs: cache.sources.map((x) => x.dir),
    files: cache.sources.flatMap((x) => x.files),
    totalEntries: cache.entries.length,
    fixedEntries,
    projectLocalEntries,
    categories
  };
}

export function getDispatcherPolicy(): DispatcherPolicy {
  return {
    crossDictionary: true,
    scoring: {
      exactTerm: SCORE_WEIGHTS.exactTerm,
      alias: SCORE_WEIGHTS.alias,
      uppercaseFloor: SCORE_WEIGHTS.uppercaseFloor,
      contextBonus: SCORE_WEIGHTS.contextBonus,
      shortTokenPenalty: SCORE_WEIGHTS.shortTokenPenalty,
      genericWordPenalty: SCORE_WEIGHTS.genericWordPenalty,
      repeatedHitBoostPerHit: SCORE_WEIGHTS.repeatedHitBoostPerHit,
      repeatedHitBoostMax: SCORE_WEIGHTS.repeatedHitBoostMax
    },
    thresholds: {
      minScore: DEFAULT_MIN_SCORE,
      maxPerLine: DEFAULT_MAX_PER_LINE,
      maxPerCategoryPerLine: DEFAULT_MAX_PER_CATEGORY,
      maxTotal: DEFAULT_MAX_TOTAL
    }
  };
}

export function lookupDictionaryTerm(term: string): DictionaryHit | null {
  const cache = ensureLoaded();
  const raw = term.trim();
  if (!raw) return null;

  const exact = cache.exactMap.get(normalizeLookupKey(raw));
  if (exact) return { entry: exact, matchType: "exact" };

  const alias = cache.aliasMap.get(normalizeLookupKey(raw));
  if (alias) return { entry: alias, matchType: "alias" };

  if (isAcronymLike(raw)) {
    const acronym = cache.acronymMap.get(normalizeAcronymKey(raw));
    if (acronym) return { entry: acronym, matchType: "acronym" };
  }

  return null;
}

export function dispatchDictionaryTerms(text: string, opts?: DispatchOptions): DispatchMatchResult[] {
  const cache = ensureLoaded();
  const options: Required<DispatchOptions> = {
    minScore: opts?.minScore ?? DEFAULT_MIN_SCORE,
    maxPerLine: opts?.maxPerLine ?? DEFAULT_MAX_PER_LINE,
    maxPerCategory: opts?.maxPerCategory ?? DEFAULT_MAX_PER_CATEGORY,
    maxTotal: opts?.maxTotal ?? DEFAULT_MAX_TOTAL
  };

  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const aggregate = new Map<string, DispatchMatchResult>();

  for (const line of lines) {
    const lineResults = scoreLine(line, cache.entries, options);
    for (const row of lineResults) {
      const key = normalizeLookupKey(row.entry.term);
      const existing = aggregate.get(key);
      if (!existing) {
        aggregate.set(key, row);
        continue;
      }

      existing.hits += 1;
      if (row.score > existing.score) {
        existing.score = row.score;
        existing.matchedText = row.matchedText;
        existing.reason = row.reason;
      }

      const mergedReasons = new Set<MatchReason>([...existing.reasons, ...row.reasons]);
      existing.reasons = [...mergedReasons];
    }
  }

  const ranked = [...aggregate.values()]
    .map((row) => {
      // Repeated hits in meeting lines slightly boost confidence.
      const boosted =
        row.score +
        Math.min(
          SCORE_WEIGHTS.repeatedHitBoostMax,
          Math.max(0, row.hits - 1) * SCORE_WEIGHTS.repeatedHitBoostPerHit
        );
      return { ...row, score: boosted };
    })
    .filter((x) => x.score >= options.minScore)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, options.maxTotal);
}

export function matchFixedDictionaryTerms(
  text: string,
  profile: FixedDictionaryProfile = "system_development",
  opts?: FixedMatchOptions
): DispatchMatchResult[] {
  if (!text.trim()) {
    return [];
  }

  const cache = ensureLoaded();
  const targetFiles = new Set(
    (opts?.files && opts.files.length > 0 ? opts.files : [...FIXED_PROFILE_FILES[profile]]).map((x) =>
      x.toLowerCase()
    )
  );
  const targetEntries = cache.entries.filter((entry) => targetFiles.has(entry.file.toLowerCase()));
  const maxTotal = Math.max(1, opts?.maxTotal ?? DEFAULT_MAX_TOTAL);

  type InternalMatch = DispatchMatchResult & { firstPos: number };
  const aggregate = new Map<string, InternalMatch>();

  for (const entry of targetEntries) {
    const seenCandidate = new Set<string>();
    const candidates: Array<{ value: string; isAlias: boolean }> = [
      { value: entry.term, isAlias: false },
      ...entry.aliases.map((x) => ({ value: x, isAlias: true }))
    ];

    let bestMatch: InternalMatch | null = null;
    let totalHits = 0;
    const reasonSet = new Set<MatchReason>();

    for (const candidate of candidates) {
      const value = candidate.value.trim();
      if (!value || value.length < 2) continue;

      const key = normalizeLookupKey(value);
      if (seenCandidate.has(key)) continue;
      seenCandidate.add(key);

      const hits = countOccurrences(text, value);
      if (hits <= 0) continue;
      const firstPos = findFirstOccurrence(text, value);

      totalHits += hits;
      let score: number = candidate.isAlias ? SCORE_WEIGHTS.alias : SCORE_WEIGHTS.exactTerm;
      const reasons: MatchReason[] = [candidate.isAlias ? "alias" : "term"];
      if (isAcronymLike(value)) {
        score = Math.max(score, SCORE_WEIGHTS.uppercaseFloor);
        reasons.push("uppercase");
      }

      for (const reason of reasons) {
        reasonSet.add(reason);
      }

      const row: InternalMatch = {
        entry,
        matchedText: value,
        score,
        reason: reasons[0],
        reasons,
        hits,
        firstPos
      };

      if (
        !bestMatch ||
        row.score > bestMatch.score ||
        (row.score === bestMatch.score && row.firstPos < bestMatch.firstPos)
      ) {
        bestMatch = row;
      }
    }

    if (!bestMatch || totalHits <= 0) continue;

    const boostedScore =
      bestMatch.score +
      Math.min(
        SCORE_WEIGHTS.repeatedHitBoostMax,
        Math.max(0, totalHits - 1) * SCORE_WEIGHTS.repeatedHitBoostPerHit
      );

    aggregate.set(normalizeLookupKey(entry.term), {
      ...bestMatch,
      score: boostedScore,
      hits: totalHits,
      reasons: [...reasonSet]
    });
  }

  return [...aggregate.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.hits !== a.hits) return b.hits - a.hits;
      if (a.firstPos !== b.firstPos) return a.firstPos - b.firstPos;
      return a.entry.term.localeCompare(b.entry.term);
    })
    .slice(0, maxTotal)
    .map(({ firstPos, ...rest }) => rest);
}
