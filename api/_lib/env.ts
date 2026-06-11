const PLACEHOLDER_PATTERNS = [
  /^<[^>]+>$/,
  /^\$\{[^}]+\}$/,
  /placeholder/i,
  /\byour[-_\s]/i,
  /\bexample\b/i,
  /\bdummy\b/i,
  /\bchangeme\b/i,
  /\breplace[-_\s]?me\b/i,
  /\btodo\b/i
];

export function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function hasAnyEnv(names: string[]): boolean {
  return names.some((name) => readEnv(name).length > 0);
}

export function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (isPlaceholderValue(value)) {
    throw new Error(`Environment variable ${name} is placeholder text. Set a real value in Vercel project settings.`);
  }
  return value;
}
