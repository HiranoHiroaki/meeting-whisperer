function shortText(value, max = 220) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function maskSensitiveStorageValue(key, value, sensitiveKeys = new Set()) {
  if (!sensitiveKeys.has(key)) return shortText(value, 80);
  const raw = String(value ?? "");
  if (!raw) return "";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

export function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key, value, options = {}) {
  try {
    localStorage.setItem(key, value);
    const logger = options?.logger;
    if (typeof logger === "function") {
      logger("storage set", { key, valuePreview: maskSensitiveStorageValue(key, value, options?.sensitiveKeys) });
    }
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(key, options = {}) {
  try {
    localStorage.removeItem(key);
    const logger = options?.logger;
    if (typeof logger === "function") {
      logger("storage remove", { key });
    }
    return true;
  } catch {
    return false;
  }
}

export function safeSessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSessionSet(key, value, options = {}) {
  try {
    sessionStorage.setItem(key, value);
    const logger = options?.logger;
    if (typeof logger === "function") {
      logger("session set", { key, valuePreview: maskSensitiveStorageValue(key, value, options?.sensitiveKeys) });
    }
    return true;
  } catch {
    return false;
  }
}

export function safeSessionRemove(key) {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeApiBase(value, currentHostName) {
  if (!value || typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return "";
  }
  const isLocalHost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  const isLocalApp =
    currentHostName === "localhost" || currentHostName === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocalHost) return "";
  if (!isLocalApp && parsed.protocol !== "https:") return "";
  if (!/^https?:$/i.test(parsed.protocol)) return "";
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
}

export function loadApiBase(storageKey, defaultApiBase, currentHostName) {
  const raw = safeStorageGet(storageKey);
  return sanitizeApiBase(raw, currentHostName) || defaultApiBase;
}

export function loadProfile(storageKey) {
  try {
    const raw = safeStorageGet(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveProfile(storageKey, profile, options = {}) {
  return safeStorageSet(storageKey, JSON.stringify(profile), options);
}

export function loadSupplements(storageKey) {
  try {
    const raw = safeStorageGet(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        fileName: typeof x.fileName === "string" ? x.fileName : `supplement-${Date.now()}.md`,
        content: typeof x.content === "string" ? x.content : "",
        createdAt: typeof x.createdAt === "string" ? x.createdAt : new Date().toISOString()
      }))
      .slice(-20);
  } catch {
    return [];
  }
}

export function saveSupplements(storageKey, items, options = {}) {
  return safeStorageSet(storageKey, JSON.stringify((items || []).slice(-20)), options);
}

export function loadPersonalDictionary(storageKey, seed) {
  const raw = safeStorageGet(storageKey);
  if (!raw) return seed;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return seed;
    return { ...seed, ...parsed };
  } catch {
    return seed;
  }
}
