import { InvocationContext } from "@azure/functions";
import { hasAnyEnv, isPlaceholderValue, readEnv, requireEnv } from "./env.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  choices?: Array<{
    text?: string;
    message?: {
      reasoning_content?: string;
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type AzureOpenAiConfig = {
  provider: "azure_openai";
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
};

type OpenAiCompatConfig = {
  provider: "openai_compat";
  baseUrl: string;
  apiKey: string;
  model: string;
};

type AiConfig = AzureOpenAiConfig | OpenAiCompatConfig;

export type AiChatOptions = {
  temperature?: number;
  maxTokens?: number;
  responseFormatJsonObject?: boolean;
  disableThinking?: boolean;
};

const AI_HTTP_TIMEOUT_MS = Number(process.env.MW_AI_HTTP_TIMEOUT_MS ?? 25000);

const AZURE_CORE_ENV = ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"] as const;
const COMPAT_CORE_ENV = [
  "OPENAI_COMPAT_BASE_URL",
  "OPENAI_COMPAT_API_KEY",
  "OPENAI_COMPAT_MODEL",
  "KIMI_BASE_URL",
  "KIMI_API_KEY",
  "KIMI_MODEL"
] as const;

function normalizeUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function isOpenAiV1Endpoint(url: string): boolean {
  const normalized = normalizeUrl(url).toLowerCase();
  return normalized.endsWith("/openai/v1");
}

function resolveCompatEnv(primary: string, alias: string): string {
  if (readEnv(primary)) {
    return requireEnv(primary);
  }
  if (readEnv(alias)) {
    return requireEnv(alias);
  }
  throw new Error(`Missing required environment variable: ${primary} (or ${alias})`);
}

function getAzureConfig(): AzureOpenAiConfig | null {
  if (!hasAnyEnv([...AZURE_CORE_ENV, "AZURE_OPENAI_API_VERSION"])) {
    return null;
  }

  const endpoint = requireEnv("AZURE_OPENAI_ENDPOINT");
  const apiKey = requireEnv("AZURE_OPENAI_API_KEY");
  const deployment = requireEnv("AZURE_OPENAI_DEPLOYMENT");
  const apiVersionRaw = readEnv("AZURE_OPENAI_API_VERSION");
  if (apiVersionRaw && isPlaceholderValue(apiVersionRaw)) {
    throw new Error("Environment variable AZURE_OPENAI_API_VERSION is placeholder text.");
  }
  const apiVersion = apiVersionRaw || "2024-10-21";

  if (isOpenAiV1Endpoint(endpoint)) {
    return null;
  }

  return {
    provider: "azure_openai",
    endpoint,
    apiKey,
    deployment,
    apiVersion
  };
}

function getCompatConfig(): OpenAiCompatConfig | null {
  if (hasAnyEnv([...COMPAT_CORE_ENV])) {
    const baseUrl = resolveCompatEnv("OPENAI_COMPAT_BASE_URL", "KIMI_BASE_URL");
    const apiKey = resolveCompatEnv("OPENAI_COMPAT_API_KEY", "KIMI_API_KEY");
    const model = resolveCompatEnv("OPENAI_COMPAT_MODEL", "KIMI_MODEL");
    return {
      provider: "openai_compat",
      baseUrl,
      apiKey,
      model
    };
  }

  // Azure Foundry v1 style endpoint can also be called as OpenAI-compatible API.
  const azureEndpointRaw = readEnv("AZURE_OPENAI_ENDPOINT");
  if (azureEndpointRaw && isOpenAiV1Endpoint(azureEndpointRaw)) {
    const azureEndpoint = requireEnv("AZURE_OPENAI_ENDPOINT");
    const azureApiKey = requireEnv("AZURE_OPENAI_API_KEY");
    const azureDeployment = requireEnv("AZURE_OPENAI_DEPLOYMENT");
    return {
      provider: "openai_compat",
      baseUrl: azureEndpoint,
      apiKey: azureApiKey,
      model: azureDeployment
    };
  }

  return null;
}

function getAiConfig(): AiConfig | null {
  return getAzureConfig() ?? getCompatConfig();
}

export function hasAzureOpenAiConfig(): boolean {
  return getAiConfig() !== null;
}

export function getConfiguredAiSource(): "azure_openai" | "openai_compat" | null {
  const cfg = getAiConfig();
  return cfg?.provider ?? null;
}

function unpackContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part) => typeof part.text === "string" && part.text.trim().length > 0)
    .map((part) => part.text)
    .join("\n");
}

function extractTextFromPayload(payload: ChatResponse): string {
  const directOutput = typeof payload.output_text === "string" ? payload.output_text.trim() : "";
  if (directOutput) {
    return directOutput;
  }

  const fromOutput = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((part) => typeof part.text === "string" && part.text.trim().length > 0)
    .map((part) => part.text?.trim() ?? "")
    .join("\n")
    .trim();
  if (fromOutput) {
    return fromOutput;
  }

  const firstChoice = payload.choices?.[0];
  if (!firstChoice) {
    return "";
  }

  const fromMessage = unpackContent(firstChoice.message?.content).trim();
  if (fromMessage) {
    return fromMessage;
  }

  const fromReasoning = firstChoice.message?.reasoning_content?.trim() ?? "";
  if (fromReasoning) {
    return fromReasoning;
  }

  const fromChoiceText = firstChoice.text?.trim() ?? "";
  if (fromChoiceText) {
    return fromChoiceText;
  }

  return "";
}

function buildCompatChatUrl(baseUrl: string): string {
  const normalized = normalizeUrl(baseUrl);

  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }

  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/v1/chat/completions`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = AI_HTTP_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), Math.max(1000, timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const text = String(error);
    if (/AbortError|timeout/i.test(text)) {
      throw new Error(`AI request timeout after ${Math.max(1000, timeoutMs)}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAzureOpenAi(
  cfg: AzureOpenAiConfig,
  messages: ChatMessage[],
  context: InvocationContext,
  options?: AiChatOptions
): Promise<string> {
  const url = `${normalizeUrl(cfg.endpoint)}/openai/deployments/${encodeURIComponent(cfg.deployment)}/chat/completions?api-version=${encodeURIComponent(cfg.apiVersion)}`;

  const requestBody: Record<string, unknown> = {
    messages,
    temperature: options?.temperature ?? 0.2,
    max_completion_tokens: options?.maxTokens ?? 700
  };
  if (options?.responseFormatJsonObject) {
    requestBody.response_format = { type: "json_object" };
  }

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": cfg.apiKey
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const detail = await response.text();
    context.warn(`Azure OpenAI call failed (${response.status}): ${detail}`);
    throw new Error(`Azure OpenAI call failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ChatResponse;
  const text = extractTextFromPayload(payload);
  if (!text) {
    context.warn(`Azure OpenAI empty content. payload keys=${Object.keys(payload).join(",")}`);
  }
  return text;
}

async function callOpenAiCompat(
  cfg: OpenAiCompatConfig,
  messages: ChatMessage[],
  context: InvocationContext,
  options?: AiChatOptions
): Promise<string> {
  const url = buildCompatChatUrl(cfg.baseUrl);

  const requestBody: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: options?.temperature ?? 0.2,
    max_completion_tokens: options?.maxTokens ?? 700
  };
  if (options?.responseFormatJsonObject) {
    requestBody.response_format = { type: "json_object" };
  }
  const wantsThinkingDisabled = options?.disableThinking ?? true;
  if (wantsThinkingDisabled) {
    requestBody.thinking = { type: "disabled" };
  }

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${cfg.apiKey}`
  };

  let response = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });

  // Some providers reject Kimi-specific `thinking` argument.
  if (!response.ok && wantsThinkingDisabled) {
    const firstDetail = await response.text();
    const lower = firstDetail.toLowerCase();
    const isThinkingUnsupported =
      response.status === 400 &&
      (lower.includes("unrecognized request argument supplied: thinking") ||
        lower.includes("unknown field") && lower.includes("thinking"));

    if (isThinkingUnsupported) {
      context.warn("Provider rejected `thinking` parameter. Retrying without it.");
      const retryBody = { ...requestBody };
      delete (retryBody as Record<string, unknown>).thinking;
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers,
        body: JSON.stringify(retryBody)
      });
    } else {
      context.warn(`OpenAI-compatible call failed (${response.status}): ${firstDetail}`);
      throw new Error(`OpenAI-compatible call failed with status ${response.status}`);
    }
  }

  if (!response.ok) {
    const detail = await response.text();
    context.warn(`OpenAI-compatible call failed (${response.status}): ${detail}`);
    throw new Error(`OpenAI-compatible call failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ChatResponse;
  const text = extractTextFromPayload(payload);
  if (!text) {
    context.warn(`OpenAI-compatible empty content. payload keys=${Object.keys(payload).join(",")}`);
  }
  return text;
}

export async function chatWithAzureOpenAi(
  messages: ChatMessage[],
  context: InvocationContext,
  options?: AiChatOptions
): Promise<string> {
  const cfg = getAiConfig();
  if (!cfg) {
    throw new Error("AI config is missing");
  }

  const text =
    cfg.provider === "azure_openai"
      ? await callAzureOpenAi(cfg, messages, context, options)
      : await callOpenAiCompat(cfg, messages, context, options);

  if (!text) {
    throw new Error("AI provider returned empty content");
  }

  return text;
}

export function parseJsonFromText<T>(text: string): T | null {
  const direct = text.trim();
  try {
    return JSON.parse(direct) as T;
  } catch {
    // continue
  }

  const fenced = direct.match(/```json\s*([\s\S]*?)\s*```/i) ?? direct.match(/```\s*([\s\S]*?)\s*```/i);
  if (!fenced?.[1]) {
    return null;
  }

  try {
    return JSON.parse(fenced[1]) as T;
  } catch {
    // continue
  }

  const objectLike = direct.match(/\{[\s\S]*\}/);
  if (objectLike?.[0]) {
    try {
      return JSON.parse(objectLike[0]) as T;
    } catch {
      // continue
    }
  }

  const arrayLike = direct.match(/\[[\s\S]*\]/);
  if (arrayLike?.[0]) {
    try {
      return JSON.parse(arrayLike[0]) as T;
    } catch {
      // continue
    }
  }

  return null;
}
