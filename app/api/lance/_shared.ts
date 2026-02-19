import { ES_HOST as CONFIG_ES_HOST, ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";
import { resolveSearchIndex } from "@/lib/dataset-profile";

export function resolveTargetIndex(dataset?: string, explicitIndex?: string): string {
  return resolveSearchIndex(dataset, explicitIndex, process.env.ES_INDEX || "lance-validation-test");
}

export async function withInsecureTls<T>(fn: () => Promise<T>): Promise<T> {
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    return await fn();
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

export async function fetchEs(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (ES_SECURITY_ENABLED) {
    headers.set("Authorization", `Basic ${CONFIG_ES_AUTH}`);
  }

  return await fetch(`${process.env.ES_HOST || CONFIG_ES_HOST}${path}`, {
    ...init,
    headers,
  });
}

export function compactError(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}
