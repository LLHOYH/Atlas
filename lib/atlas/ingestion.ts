import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const supportedAtlasRuntimes = ["codex", "claude-code", "hermes", "openclaw", "custom"] as const;

export function getAtlasApiClient(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

export function createInstallationToken() {
  return `atlas_live_${randomBytes(32).toString("base64url")}`;
}

export function hashInstallationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createAgentId() {
  return `live-${randomUUID()}`;
}
