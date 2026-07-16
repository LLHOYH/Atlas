import { createClient } from "npm:@supabase/supabase-js@2";
import { sanitizeAtlasEventBatch } from "../../../packages/sdk/src/protocol.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
};
const MAX_BODY_BYTES = 96 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function bearer(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `atlas_live_${encoded}`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function registerInstallation(request: Request) {
  const accessToken = bearer(request);
  if (!accessToken) return json({ error: "Authentication required" }, 401);
  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json({ error: "Invalid user session" }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : "";
  const runtime = typeof body?.runtime === "string" ? body.runtime : "";
  const runtimeVersion = typeof body?.runtime_version === "string" ? body.runtime_version.trim() : "unknown";
  const cityId = typeof body?.city_id === "string" ? body.city_id.trim() : "";
  if (!displayName || displayName.length > 80
    || !["codex", "claude-code", "hermes", "openclaw", "custom"].includes(runtime)
    || runtimeVersion.length > 40
    || !/^[a-z0-9-]{2,80}$/.test(cityId)) {
    return json({ error: "Invalid Atlas installation details" }, 400);
  }
  const { data: city } = await admin.from("atlas_cities").select("id").eq("id", cityId).maybeSingle();
  if (!city) return json({ error: "Unknown Atlas city" }, 400);

  const token = randomToken();
  const agentId = `live-${crypto.randomUUID()}`;
  const { data, error } = await admin.from("atlas_agent_installations").insert({
    owner_id: userData.user.id,
    agent_id: agentId,
    display_name: displayName,
    runtime,
    runtime_version: runtimeVersion || "unknown",
    sdk_version: "0.1.0",
    city_id: cityId,
    token_hash: await sha256(token),
  }).select("id, agent_id").single();
  if (error || !data) return json({ error: error?.message ?? "Atlas registration failed" }, 409);
  return json({ installation_id: data.id, agent_id: data.agent_id, token }, 201);
}

async function ingestEvents(request: Request) {
  const token = bearer(request);
  if (!token?.startsWith("atlas_live_")) return json({ error: "Invalid Atlas installation token" }, 401);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) return json({ error: "Atlas event batch is too large" }, 413);
  const body = (() => {
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as { events?: unknown };
    } catch {
      return null;
    }
  })();
  let events;
  try {
    events = sanitizeAtlasEventBatch(body?.events);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid Atlas events" }, 400);
  }
  const { data, error } = await admin.rpc("atlas_ingest_agent_events", {
    p_token_hash: await sha256(token),
    p_events: events,
  });
  if (error) return json({ error: error.code === "28000" ? "Invalid Atlas installation token" : "Atlas ingestion failed" }, error.code === "28000" ? 401 : 400);
  return json({ accepted: Number(data?.accepted ?? events.length) }, 202);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const action = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  if (action === "installations") return registerInstallation(request);
  if (action === "events") return ingestEvents(request);
  return json({ error: "Unknown Atlas ingestion route" }, 404);
});
