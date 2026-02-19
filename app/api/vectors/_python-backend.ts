import { NextRequest } from "next/server";

export function resolvePythonBackendUrl(req?: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || process.env.PYTHON_BACKEND_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  try {
    if (req) {
      const host = req.nextUrl?.hostname || new URL(req.url).hostname || "localhost";
      return `http://${host}:8000`;
    }
  } catch {
    // Ignore URL parsing errors and fall back.
  }

  return "http://localhost:8000";
}

